import test from "node:test";
import assert from "node:assert/strict";
import { clearSession, setSession } from "../api/crm/_auth.js";
import handler from "../api/crm/calendar/oauth.js";

process.env.CRM_SESSION_SECRET = "test-session-secret";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    redirect(url) { this.location = url; return this; }
  };
}

function sessionCookie(role) {
  const res = response();
  setSession(res, { username: "test", role });
  return res.headers["Set-Cookie"].split(";")[0];
}

test("Google callback accepts the short-lived scoped admin session and state", async () => {
  const adminCookie = sessionCookie("admin");
  assert.match(adminCookie, /^weserads_crm_session=/);
  const start = response();
  await handler({ query: { action: "start" }, headers: { cookie: adminCookie, host: "example.test" } }, start);
  const cookies = start.headers["Set-Cookie"];
  assert.equal(cookies.length, 2);
  assert.match(cookies[1], /Path=\/api\/crm\/calendar\/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  const state = new URL(start.location).searchParams.get("state");
  const callbackCookies = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  const callback = response();
  await handler({ query: { action: "callback", state, error: "access_denied" }, headers: { cookie: callbackCookies } }, callback);
  assert.equal(callback.code, 400);
  assert.equal(callback.body, "Die Google-Kalenderfreigabe wurde abgebrochen.");

  const missingSession = response();
  await handler({ query: { action: "callback", state }, headers: { cookie: cookies[0].split(";")[0] } }, missingSession);
  assert.equal(missingSession.code, 403);
  const invalidState = response();
  await handler({ query: { action: "callback", state: `${state}x` }, headers: { cookie: callbackCookies } }, invalidState);
  assert.equal(invalidState.code, 400);
});

test("non-admins cannot start calendar authorization and logout clears both sessions", async () => {
  const start = response();
  await handler({ query: { action: "start" }, headers: { cookie: sessionCookie("user") } }, start);
  assert.equal(start.code, 403);
  const logout = response();
  clearSession(logout);
  assert.match(logout.headers["Set-Cookie"][0], /SameSite=Strict; Max-Age=0/);
  assert.match(logout.headers["Set-Cookie"][1], /Path=\/api\/crm\/calendar\/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0/);
});
