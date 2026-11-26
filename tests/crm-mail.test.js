import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import handler, { cleanAddresses, cleanFolder, cleanSend, cleanUid } from "../api/crm/mail.js";

const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
const cookie = (role) => {
  process.env.CRM_SESSION_SECRET = "test-secret";
  const issued = Math.floor(Date.now() / 1000).toString(), user = Buffer.from("Tester").toString("base64url");
  const sig = crypto.createHmac("sha256", "test-secret").update(`${issued}.${user}.${role}`).digest("hex");
  return `weserads_crm_session=${issued}.${user}.${role}.${sig}`;
};

test("the mailbox is closed without login and for non-admin users", async () => {
  let res = response();
  await handler({ method: "GET", headers: {}, query: { action: "folders" } }, res);
  assert.equal(res.code, 403);
  res = response();
  await handler({ method: "GET", headers: { cookie: cookie("user") }, query: { action: "folders" } }, res);
  assert.equal(res.code, 403);
});

test("an admin without a configured password gets a clear message instead of a crash", async () => {
  delete process.env.IONOS_SMTP_PASSWORD;
  const res = response();
  await handler({ method: "GET", headers: { cookie: cookie("admin") }, query: { action: "folders" } }, res);
  assert.equal(res.code, 503);
  assert.match(res.body.error, /nicht eingerichtet/);
});

test("addresses are parsed, deduplicated and rejected when invalid", () => {
  assert.deepEqual(cleanAddresses("Max <Max@Firma.de>, a@b.de; a@b.de"), ["max@firma.de", "a@b.de"]);
  assert.equal(cleanAddresses("kein-mail"), null);
  assert.equal(cleanAddresses("a@b.de\r\nBcc: x@y.de"), null);
  assert.equal(cleanAddresses(Array(21).fill("a@b.de").map((a, i) => `${i}${a}`).join(",")), null);
});

test("send input strips header injection and needs recipient, subject and text", () => {
  const mail = cleanSend({ to: "a@b.de", subject: "Hallo\r\nBcc: boese@x.de", text: "Text", inReplyTo: "<id@host>" });
  assert.equal(mail.subject, "Hallo Bcc: boese@x.de");
  assert.equal(mail.inReplyTo, "<id@host>");
  assert.equal(cleanSend({ to: "a@b.de", subject: "", text: "x" }), null);
  assert.equal(cleanSend({ to: "", subject: "x", text: "x" }), null);
  assert.equal(cleanSend({ to: "a@b.de", subject: "x", text: "x", inReplyTo: "kaputt\r\nX: y" }).inReplyTo, "");
});

test("folder and uid input is validated", () => {
  assert.equal(cleanFolder("INBOX"), "INBOX");
  assert.equal(cleanFolder("Gesendete Objekte"), "Gesendete Objekte");
  assert.equal(cleanFolder("a\r\nb"), null);
  assert.equal(cleanFolder(""), null);
  assert.equal(cleanUid("42"), 42);
  assert.equal(cleanUid("-1"), null);
  assert.equal(cleanUid("1.5"), null);
});
