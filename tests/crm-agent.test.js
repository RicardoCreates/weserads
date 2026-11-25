import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { cleanAds, cleanGoals, cleanJob, validToken } from "../api/crm/_agent.js";
import handler from "../api/crm/agent.js";

const token = "a".repeat(43), hash = crypto.createHash("sha256").update(token).digest("hex");
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test("agent access is closed without or with a wrong token", async () => {
  assert.equal(validToken(`Bearer ${token}`, undefined), false);
  assert.equal(validToken(`Bearer ${"b".repeat(43)}`, hash), false);
  assert.equal(validToken(`Bearer ${token}`, hash), true);
  delete process.env.CRM_AGENT_TOKEN_HASH;
  const res = response();
  await handler({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { action: "snapshot" } }, res);
  assert.equal(res.code, 401);
});
test("the ads token cannot read CRM data and the agent token cannot approve", async () => {
  process.env.CRM_ADS_TOKEN_HASH = hash; process.env.CRM_AGENT_TOKEN_HASH = "0".repeat(64);
  let res = response();
  await handler({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { action: "snapshot" } }, res);
  assert.equal(res.code, 401);
  process.env.CRM_AGENT_TOKEN_HASH = hash;
  res = response();
  await handler({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: { id: "0".repeat(32), decision: "ok" } }, res);
  assert.equal(res.code, 400);
});
test("approving requires an admin session", async () => {
  const res = response();
  await handler({ method: "POST", headers: {}, body: { id: "0".repeat(32), decision: "ok" } }, res);
  assert.equal(res.code, 403);
});
test("proposals are validated", () => {
  const mail = (to, subject = "Hallo") => cleanJob({ type: "mail", key: "k", title: "t", payload: { to, subject, body: "x" } });
  assert.ok(mail("a@b.de"));
  assert.equal(mail("a@b.de, c@d.de"), null);
  assert.equal(mail("a@b.de", "Hi\r\nBcc: x@y.de").payload.subject.includes("\n"), false);
  const event = (date, startTime, endTime) => cleanJob({ type: "event", key: "k", title: "t", payload: { title: "T", date, startTime, endTime } });
  assert.ok(event("2026-12-01", "10:00", "10:30"));
  assert.equal(event("2026-13-01", "10:00", "10:30"), null);
  assert.equal(event("2026-12-01", "11:00", "10:30"), null);
  assert.equal(cleanJob({ type: "delete", key: "k", title: "t", payload: {} }), null);
  assert.equal(cleanAds({ account: "1", campaigns: [{ name: "S", cost: -5 }] }).campaigns[0].cost, 0);
});
test("goals keep a valid start month and positive steps, and need an admin", async () => {
  assert.deepEqual(cleanGoals({ base: "100", start: "2027-13", steps: [1, -2, "x", 300] }), { base: 100, start: "", steps: [1, 300] });
  assert.equal(cleanGoals({ base: 1 }), null);
  const res = response();
  await handler({ method: "POST", headers: {}, body: { decision: "goals", payload: { base: 1, steps: [] } } }, res);
  assert.equal(res.code, 403);
});
