import crypto from "node:crypto";

export const TYPES = ["mail", "event", "task", "info"];
const text = (value, max) => String(value ?? "").trim().slice(0, max);
const line = (value, max) => text(value, max * 2).replace(/[\r\n]+/g, " ").slice(0, max);

// Im Server liegt nur der SHA-256 des Schlüssels. Fehlt er, ist der Zugang zu.
export function validToken(header, configured) {
  if (!/^[a-f0-9]{64}$/i.test(configured || "")) return false;
  const token = /^Bearer (\S{32,200})$/.exec(String(header || ""))?.[1];
  if (!token) return false;
  const actual = crypto.createHash("sha256").update(token).digest();
  return crypto.timingSafeEqual(actual, Buffer.from(configured, "hex"));
}

export const jobId = (key) => crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 32);

export function cleanPayload(type, input = {}) {
  if (type === "mail") {
    const to = line(input.to, 200);
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return null;
    const body = text(input.body, 8000), subject = line(input.subject, 200);
    return body && subject ? { to, subject, body, inReplyTo: line(input.inReplyTo, 300) } : null;
  }
  if (type === "event") {
    const { date, startTime, endTime } = input;
    const title = line(input.title, 200);
    const real = /^\d{4}-\d{2}-\d{2}$/.test(date || "") && !Number.isNaN(Date.parse(date));
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!title || !real || !time.test(startTime || "") || !time.test(endTime || "") || startTime >= endTime) return null;
    const eventId = /^[A-Za-z0-9_-]{5,200}$/.test(input.eventId || "") ? input.eventId : "";
    return { title, date, startTime, endTime, location: line(input.location, 200), notes: text(input.notes, 2000), eventId };
  }
  if (type === "task") {
    const customerId = String(input.customerId || ""), title = line(input.text, 200);
    if (!/^[a-f0-9]{24}$/i.test(customerId) || !title) return null;
    return { customerId, text: title, date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : "" };
  }
  return type === "info" ? { body: text(input.body, 8000) } : null;
}

export function cleanJob(input) {
  const payload = TYPES.includes(input?.type) ? cleanPayload(input.type, input.payload) : null;
  const key = line(input?.key, 300), title = line(input?.title, 200);
  if (!payload || !key || !title) return null;
  return { _id: jobId(key), type: input.type, agent: line(input.agent, 40), title, reason: text(input.reason, 1500), payload };
}

const num = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
export function cleanAds(input) {
  const account = line(input?.account, 60);
  if (!account || !Array.isArray(input.campaigns)) return null;
  return {
    account, name: line(input.name, 120), currency: line(input.currency, 5), period: line(input.period, 60),
    campaigns: input.campaigns.slice(0, 100).map((c) => ({ name: line(c?.name, 120), type: line(c?.type, 40), cost: num(c?.cost), clicks: num(c?.clicks), impressions: num(c?.impressions), conversions: num(c?.conversions), prevCost: num(c?.prevCost), prevConversions: num(c?.prevConversions) })),
    terms: (Array.isArray(input.terms) ? input.terms : []).slice(0, 50).map((t) => ({ term: line(t?.term, 120), cost: num(t?.cost), clicks: num(t?.clicks), conversions: num(t?.conversions) }))
  };
}
