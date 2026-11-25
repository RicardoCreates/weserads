import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import { requireAdmin } from "./_auth.js";
import { collection } from "./_db.js";
import { googleRequest } from "./_calendar.js";
import { cleanAds, cleanGoals, cleanJob, cleanPayload, validToken } from "./_agent.js";

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const OWN_MAIL = "kontakt@weserads.de";

async function snapshot() {
  const rows = await (await collection("customers")).find({ status: { $nin: ["Lead", "Verloren", "Neu", "Abgesagt"] } })
    .project({ firma: 1, kontakt: 1, email: 1, status: 1, produkt: 1, wert: 1, aufgaben: 1 }).limit(300).toArray();
  let events = [], calendarError = "";
  try {
    const query = new URLSearchParams({ timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 21 * 864e5).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "60" });
    events = ((await googleRequest(`${EVENTS}?${query}`)).items || []).map((e) => ({ id: e.id, title: e.summary || "", start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date }));
  } catch (error) { calendarError = error.message; }
  const ads = await (await collection("agent_ads")).find({}).toArray();
  return { customers: rows.map(({ _id, aufgaben, ...row }) => ({ ...row, id: _id.toString(), aufgaben: (aufgaben || []).filter((t) => !t.done) })), events, calendarError, ads: ads.map(({ _id, ...a }) => a) };
}

async function worker(req, res) {
  const { action, data } = req.body || {};
  if (action === "heartbeat") {
    const settings = await (await collection("agent_state")).findOne({ _id: "settings" });
    await (await collection("agent_state")).updateOne({ _id: "worker" }, { $set: { seenAt: new Date(), note: String(data?.note || "").slice(0, 200), load: Math.min(100, Math.max(0, Number(data?.load) || 0)) } }, { upsert: true });
    return res.status(200).json({ paused: Boolean(settings?.paused) });
  }
  if (action === "snapshot") return res.status(200).json(await snapshot());
  if (action === "propose") {
    const job = cleanJob(data);
    if (!job) return res.status(400).json({ error: "Ungültiger Vorschlag." });
    const { _id, ...fields } = job;
    const result = await (await collection("agent_jobs")).updateOne({ _id }, { $setOnInsert: { ...fields, status: "offen", createdAt: new Date() } }, { upsert: true });
    return res.status(200).json({ created: Boolean(result.upsertedCount) });
  }
  return res.status(400).json({ error: "Unbekannte Aktion." });
}

async function execute(job) {
  const p = job.payload;
  if (job.type === "mail") {
    if (!process.env.IONOS_SMTP_PASSWORD) throw Object.assign(new Error("Mailversand ist nicht eingerichtet."), { before: true });
    const transporter = nodemailer.createTransport({ host: "smtp.ionos.de", port: 465, secure: true, auth: { user: OWN_MAIL, pass: process.env.IONOS_SMTP_PASSWORD } });
    await transporter.sendMail({ from: `WeserAds <${OWN_MAIL}>`, to: p.to, bcc: OWN_MAIL, subject: p.subject, text: p.body, ...(p.inReplyTo ? { inReplyTo: p.inReplyTo, references: p.inReplyTo } : {}) });
    return `Gesendet an ${p.to}`;
  }
  if (job.type === "event") {
    const body = JSON.stringify({ summary: p.title, location: p.location, ...(p.notes ? { description: p.notes } : {}), start: { dateTime: `${p.date}T${p.startTime}:00`, timeZone: "Europe/Berlin" }, end: { dateTime: `${p.date}T${p.endTime}:00`, timeZone: "Europe/Berlin" } });
    await googleRequest(p.eventId ? `${EVENTS}/${encodeURIComponent(p.eventId)}` : EVENTS, { method: p.eventId ? "PATCH" : "POST", body });
    return p.eventId ? "Termin geändert" : "Termin eingetragen";
  }
  if (job.type === "task") {
    const result = await (await collection("customers")).updateOne({ _id: new ObjectId(p.customerId) }, { $push: { aufgaben: { id: crypto.randomUUID(), text: p.text, date: p.date, done: false } }, $set: { updatedAt: new Date() } });
    if (!result.matchedCount) throw Object.assign(new Error("Kontakt nicht gefunden."), { before: true });
    return "Aufgabe angelegt";
  }
  return "Gelesen";
}

async function decide(req, res) {
  const { id, decision, payload } = req.body || {};
  if (decision === "goals") {
    const goals = cleanGoals(payload);
    if (!goals) return res.status(400).json({ error: "Ungültige Ziele." });
    await (await collection("agent_state")).updateOne({ _id: "goals" }, { $set: goals }, { upsert: true });
    return res.status(200).json(goals);
  }
  if (decision === "pause" || decision === "resume") {
    await (await collection("agent_state")).updateOne({ _id: "settings" }, { $set: { paused: decision === "pause" } }, { upsert: true });
    return res.status(200).json({ ok: true });
  }
  if (!/^[a-f0-9]{32}$/.test(String(id || "")) || !["ok", "no"].includes(decision)) return res.status(400).json({ error: "Ungültige Anfrage." });
  const jobs = await collection("agent_jobs");
  if (decision === "no") {
    const r = await jobs.updateOne({ _id: id, status: "offen" }, { $set: { status: "verworfen", doneAt: new Date() } });
    return res.status(r.matchedCount ? 200 : 409).json(r.matchedCount ? { ok: true } : { error: "Schon bearbeitet." });
  }
  const before = await jobs.findOne({ _id: id, status: "offen" });
  if (!before) return res.status(409).json({ error: "Schon bearbeitet." });
  // Geprüft und gespeichert wird genau das, was der Admin im Formular sieht. Empfänger und IDs bleiben unverändert.
  const edit = before.type === "mail" ? { subject: payload?.subject, body: payload?.body } : {};
  const final = cleanPayload(before.type, { ...before.payload, ...edit });
  if (!final) return res.status(400).json({ error: "Text oder Betreff fehlt." });
  // Erst sperren, dann ausführen: Doppelklicks lösen nichts doppelt aus.
  const lock = await jobs.updateOne({ _id: id, status: "offen" }, { $set: { status: "unklar", payload: final, doneAt: new Date() } });
  if (!lock.modifiedCount) return res.status(409).json({ error: "Schon bearbeitet." });
  try {
    const result = await execute({ ...before, payload: final });
    await jobs.updateOne({ _id: id }, { $set: { status: "erledigt", result } });
    return res.status(200).json({ result });
  } catch (error) {
    console.error("Agenten-Auftrag fehlgeschlagen", id, error);
    if (error.before) await jobs.updateOne({ _id: id }, { $set: { status: "offen" } });
    return res.status(502).json({ error: error.before ? error.message : "Ergebnis unklar. Bitte im Postfach oder Kalender prüfen, bevor du es wiederholst." });
  }
}

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    if (auth && req.method === "POST") {
      // Das Google-Ads-Skript hat einen eigenen Schlüssel und darf nur Zahlen abliefern.
      if (req.body?.action === "ads") {
        if (!validToken(auth, process.env.CRM_ADS_TOKEN_HASH)) return res.status(401).json({ error: "Nicht autorisiert." });
        const ads = cleanAds(req.body.data);
        if (!ads) return res.status(400).json({ error: "Ungültige Daten." });
        await (await collection("agent_ads")).replaceOne({ _id: ads.account }, { ...ads, receivedAt: new Date() }, { upsert: true });
        return res.status(200).json({ ok: true });
      }
      if (!validToken(auth, process.env.CRM_AGENT_TOKEN_HASH)) return res.status(401).json({ error: "Nicht autorisiert." });
      return await worker(req, res);
    }
    if (!requireAdmin(req, res)) return;
    if (req.method === "GET") {
      const state = await collection("agent_state"), jobs = await collection("agent_jobs");
      const [live, settings, goals, open, done] = await Promise.all([state.findOne({ _id: "worker" }), state.findOne({ _id: "settings" }), state.findOne({ _id: "goals" }), jobs.find({ status: { $in: ["offen", "unklar"] } }).sort({ createdAt: -1 }).limit(60).toArray(), jobs.find({ status: "erledigt" }).sort({ doneAt: -1 }).limit(8).toArray()]);
      const out = (list) => list.map(({ _id, ...job }) => ({ ...job, id: _id }));
      return res.status(200).json({ online: Boolean(live?.seenAt && Date.now() - live.seenAt.getTime() < 180000), seenAt: live?.seenAt || null, note: live?.note || "", load: live?.load || 0, paused: Boolean(settings?.paused), goals: goals ? { base: goals.base, start: goals.start, steps: goals.steps } : null, jobs: out(open), done: out(done) });
    }
    if (req.method === "POST") return await decide(req, res);
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (error) {
    console.error("Agenten-Fehler", error);
    return res.status(500).json({ error: "Die Agenten-Schnittstelle ist momentan nicht erreichbar." });
  }
}
