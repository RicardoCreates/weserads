// Postfach kontakt@weserads.de im CRM: Mails werden live bei IONOS gelesen und
// nicht in der Datenbank gespeichert. Nur der CRM-Admin hat Zugriff.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { getSession } from "./_auth.js";

export const OWN_MAIL = "kontakt@weserads.de";
const PAGE = 40;
const ROLES = { inbox: "\\Inbox", sent: "\\Sent", drafts: "\\Drafts", trash: "\\Trash", junk: "\\Junk" };
const NAMES = { sent: /gesendet|sent/i, drafts: /entw[uü]rf|draft/i, trash: /papierkorb|gel[oö]scht|trash|deleted/i, junk: /spam|junk/i };
const ROLE_LABEL = { inbox: "Posteingang", sent: "Gesendet", drafts: "Entwürfe", trash: "Papierkorb", junk: "Spam" };
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function cleanFolder(value) {
  const folder = String(value ?? "").trim();
  if (!folder || folder.length > 200 || /[\u0000-\u001f\u007f]/.test(folder)) return null;
  return folder;
}

export function cleanUid(value) {
  const uid = Number(value);
  return Number.isInteger(uid) && uid > 0 && uid < 2 ** 32 ? uid : null;
}

export function cleanAddresses(value, max = 20) {
  const list = String(value ?? "").split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)
    .map((part) => (part.match(/<([^>]+)>\s*$/)?.[1] || part).trim().toLowerCase());
  if (list.length > max || list.some((mail) => mail.length > 254 || !EMAIL.test(mail))) return null;
  return [...new Set(list)];
}

export function cleanSend(body) {
  const to = cleanAddresses(body?.to);
  const cc = body?.cc ? cleanAddresses(body.cc) : [];
  const subject = String(body?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  const text = String(body?.text ?? "").slice(0, 100_000);
  const ref = (value) => {
    const id = String(value ?? "").trim();
    return id && id.length <= 998 && /^<[^\s<>]+>(\s+<[^\s<>]+>)*$/.test(id) ? id : "";
  };
  if (!to?.length || cc === null || !subject || !text.trim()) return null;
  return { to, cc, subject, text, inReplyTo: ref(body?.inReplyTo), references: ref(body?.references) };
}

function isAdmin(req) {
  return Boolean(process.env.CRM_SESSION_SECRET) && getSession(req)?.role === "admin";
}

async function imap() {
  if (!process.env.IONOS_SMTP_PASSWORD) throw Object.assign(new Error("Das Postfach ist nicht eingerichtet."), { status: 503 });
  const client = new ImapFlow({
    host: "imap.ionos.de", port: 993, secure: true, logger: false,
    auth: { user: OWN_MAIL, pass: process.env.IONOS_SMTP_PASSWORD },
    connectionTimeout: 9000, greetingTimeout: 6000, socketTimeout: 20000
  });
  await client.connect();
  return client;
}

async function withImap(fn) {
  const client = await imap();
  try { return await fn(client); } finally { await client.logout().catch(() => client.close()); }
}

function roleOf(box) {
  for (const [role, flag] of Object.entries(ROLES)) if (box.specialUse === flag) return role;
  if (box.path.toUpperCase() === "INBOX") return "inbox";
  for (const [role, re] of Object.entries(NAMES)) if (re.test(box.name)) return role;
  return "";
}

async function folders(client) {
  const list = (await client.list({ statusQuery: { unseen: true, messages: true } }))
    .filter((box) => !box.flags?.has("\\Noselect"));
  const seen = new Set();
  return list.map((box) => {
    let role = roleOf(box);
    if (role && seen.has(role)) role = "";
    if (role) seen.add(role);
    return { path: box.path, name: ROLE_LABEL[role] || box.name, role, unseen: box.status?.unseen || 0, total: box.status?.messages || 0 };
  }).sort((a, b) => {
    const order = ["inbox", "sent", "drafts", "junk", "trash"];
    const ra = a.role ? order.indexOf(a.role) : 99, rb = b.role ? order.indexOf(b.role) : 99;
    return ra - rb || a.name.localeCompare(b.name, "de");
  });
}

async function folderFor(client, role) {
  return (await folders(client)).find((box) => box.role === role)?.path || null;
}

const addr = (list) => (list || []).map((a) => ({ name: a.name || "", address: (a.address || "").toLowerCase() }));

function summary(msg) {
  const flags = msg.flags || new Set();
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.disposition === "attachment" || (node.disposition === "inline" && node.dispositionParameters?.filename && !/^image\//.test(node.type))) parts.push(node);
    (node.childNodes || []).forEach(walk);
  };
  walk(msg.bodyStructure);
  return {
    uid: msg.uid,
    subject: msg.envelope?.subject || "(ohne Betreff)",
    from: addr(msg.envelope?.from)[0] || { name: "", address: "" },
    to: addr(msg.envelope?.to),
    date: (msg.envelope?.date || msg.internalDate || new Date()).toISOString?.() || null,
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    answered: flags.has("\\Answered"),
    attachments: parts.length
  };
}

async function list(client, folder, page, query) {
  const lock = await client.getMailboxLock(folder);
  try {
    const total = client.mailbox.exists || 0;
    let uids;
    if (query) {
      const found = await client.search({ or: [{ subject: query }, { from: query }, { to: query }, { body: query }] }, { uid: true });
      uids = (found || []).sort((a, b) => b - a);
    }
    const out = [];
    if (query) {
      const slice = uids.slice((page - 1) * PAGE, page * PAGE);
      if (slice.length) for await (const msg of client.fetch(slice, { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true }, { uid: true })) out.push(summary(msg));
      return { total: uids.length, page, pages: Math.max(1, Math.ceil(uids.length / PAGE)), messages: out.sort((a, b) => b.uid - a.uid) };
    }
    const end = total - (page - 1) * PAGE, start = Math.max(1, end - PAGE + 1);
    if (end >= 1) for await (const msg of client.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true })) out.push(summary(msg));
    return { total, page, pages: Math.max(1, Math.ceil(total / PAGE)), messages: out.sort((a, b) => b.uid - a.uid) };
  } finally { lock.release(); }
}

async function readMessage(client, folder, uid) {
  const lock = await client.getMailboxLock(folder);
  try {
    const msg = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
    if (!msg?.source) return null;
    const parsed = await simpleParser(msg.source, { skipImageLinks: false });
    if (!msg.flags?.has("\\Seen")) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
    const files = (parsed.attachments || []).map((a, index) => ({ index, filename: a.filename || `Anhang-${index + 1}`, size: a.size || a.content?.length || 0, contentType: a.contentType || "application/octet-stream", related: Boolean(a.related) }))
      .filter((a) => !a.related);
    const html = typeof parsed.html === "string" && parsed.html.length <= 2_000_000 ? parsed.html : "";
    return {
      uid, folder,
      subject: parsed.subject || "(ohne Betreff)",
      from: addr(parsed.from?.value)[0] || { name: "", address: "" },
      to: addr(parsed.to?.value), cc: addr(parsed.cc?.value),
      replyTo: addr(parsed.replyTo?.value)[0] || null,
      date: parsed.date ? parsed.date.toISOString() : null,
      messageId: parsed.messageId || "",
      references: [].concat(parsed.references || []).join(" "),
      text: (parsed.text || "").slice(0, 300_000),
      html,
      attachments: files
    };
  } finally { lock.release(); }
}

async function attachment(client, folder, uid, index) {
  const lock = await client.getMailboxLock(folder);
  try {
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg?.source) return null;
    const parsed = await simpleParser(msg.source);
    return (parsed.attachments || [])[index] || null;
  } finally { lock.release(); }
}

async function send(client, mail) {
  const message = {
    from: `WeserAds <${OWN_MAIL}>`, to: mail.to, cc: mail.cc.length ? mail.cc : undefined,
    subject: mail.subject, text: mail.text,
    ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo, references: [mail.references, mail.inReplyTo].filter(Boolean).join(" ") } : {})
  };
  const transporter = nodemailer.createTransport({ host: "smtp.ionos.de", port: 465, secure: true, auth: { user: OWN_MAIL, pass: process.env.IONOS_SMTP_PASSWORD } });
  const info = await transporter.sendMail(message);
  // Kopie in „Gesendet“ ablegen, damit die Mail auch bei IONOS dort auftaucht.
  try {
    const sent = await folderFor(client, "sent");
    if (sent) {
      const raw = await new MailComposer({ ...message, messageId: info.messageId, date: new Date() }).compile().build();
      await client.append(sent, raw, ["\\Seen"]);
    }
  } catch (error) { console.error("Ablage in Gesendet fehlgeschlagen", error.message); }
  return info.messageId;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Nur der CRM-Admin hat Zugriff auf das Postfach." });
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const action = String(req.query?.action || "");
      if (action === "folders") return res.status(200).json(await withImap(folders));
      if (action === "unread") return res.status(200).json(await withImap(async (c) => ({ unseen: (await c.status("INBOX", { unseen: true })).unseen || 0 })));
      const folder = cleanFolder(req.query?.folder || "INBOX");
      if (!folder) return res.status(400).json({ error: "Ungültiger Ordner." });
      if (action === "list") {
        const page = Math.max(1, Math.min(500, Number(req.query?.page) || 1));
        const query = String(req.query?.q || "").trim().slice(0, 100);
        return res.status(200).json(await withImap((c) => list(c, folder, page, query)));
      }
      const uid = cleanUid(req.query?.uid);
      if (!uid) return res.status(400).json({ error: "Ungültige Nachricht." });
      if (action === "message") {
        const msg = await withImap((c) => readMessage(c, folder, uid));
        return msg ? res.status(200).json(msg) : res.status(404).json({ error: "Die Mail gibt es nicht mehr." });
      }
      if (action === "attachment") {
        const index = Number(req.query?.index);
        if (!Number.isInteger(index) || index < 0 || index > 200) return res.status(400).json({ error: "Ungültiger Anhang." });
        const file = await withImap((c) => attachment(c, folder, uid, index));
        if (!file) return res.status(404).json({ error: "Anhang nicht gefunden." });
        if (file.content.length > 4_000_000) return res.status(413).json({ error: "Der Anhang ist zu groß für den Download im CRM. Bitte bei IONOS öffnen." });
        const name = (file.filename || "anhang").replace(/[^\w.\- äöüÄÖÜß()]/g, "_").slice(0, 120);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.status(200).send(file.content);
      }
      return res.status(400).json({ error: "Unbekannte Aktion." });
    }
    if (req.method === "POST") {
      const body = req.body || {};
      if (body.action === "send") {
        const mail = cleanSend(body);
        if (!mail) return res.status(400).json({ error: "Bitte Empfänger, Betreff und Text prüfen." });
        const id = await withImap((c) => send(c, mail));
        // Ursprüngliche Mail als beantwortet markieren
        const folder = cleanFolder(body.replyFolder), uid = cleanUid(body.replyUid);
        if (folder && uid && mail.inReplyTo) await withImap(async (c) => { const lock = await c.getMailboxLock(folder); try { await c.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true }); } finally { lock.release(); } }).catch(() => {});
        return res.status(200).json({ sent: true, messageId: id });
      }
      const folder = cleanFolder(body.folder), uid = cleanUid(body.uid);
      if (!folder || !uid) return res.status(400).json({ error: "Ungültige Nachricht." });
      if (body.action === "seen") {
        await withImap(async (c) => { const lock = await c.getMailboxLock(folder); try {
          await (body.seen ? c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }) : c.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true }));
        } finally { lock.release(); } });
        return res.status(200).json({ ok: true });
      }
      if (body.action === "move") {
        const role = ["trash", "inbox", "junk"].includes(body.to) ? body.to : null;
        if (!role) return res.status(400).json({ error: "Unbekanntes Ziel." });
        await withImap(async (c) => {
          const target = role === "inbox" ? "INBOX" : await folderFor(c, role);
          if (!target) throw Object.assign(new Error("Zielordner nicht gefunden."), { status: 404 });
          const lock = await c.getMailboxLock(folder);
          try { await c.messageMove(String(uid), target, { uid: true }); } finally { lock.release(); }
        });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "Unbekannte Aktion." });
    }
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (error) {
    console.error("Postfach-Fehler", error.message);
    const auth = /auth|login|credentials/i.test(error.message || "") || error.authenticationFailed;
    return res.status(error.status || (auth ? 502 : 500)).json({ error: auth ? "IONOS hat die Anmeldung abgelehnt. Bitte das Postfach-Passwort in Vercel prüfen." : error.status ? error.message : "Das Postfach ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen." });
  }
}
