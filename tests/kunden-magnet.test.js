import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isCountableScan, isGoogleReviewUrl, slugify, validateCustomerInput, dayKey } from "../api/magnet/_core.js";
import { createCustomerHandler, createRedirectHandler } from "../api/magnet/_handlers.js";

const SECRET = "test-secret";
process.env.CRM_SESSION_SECRET = SECRET;

function adminCookie() {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const username = "admin";
  const enc = Buffer.from(username).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(`${issuedAt}.${enc}.admin`).digest("hex");
  return `weserads_crm_session=${issuedAt}.${enc}.admin.${sig}`;
}

function memoryStore() {
  const customers = new Map();
  const scans = [];
  return {
    customers, scans,
    async findCustomer(slug) { return customers.get(slug) ? { ...customers.get(slug) } : null; },
    async createCustomer(doc) { if (customers.has(doc.slug)) return false; customers.set(doc.slug, { ...doc }); return true; },
    async updateCustomer(slug, fields) { if (!customers.has(slug)) return null; const d = { ...customers.get(slug), ...fields }; customers.set(slug, d); return { ...d }; },
    async listCustomers() { return [...customers.values()]; },
    async recordScan(slug) { scans.push(slug); const d = customers.get(slug); d.scansTotal = (d.scansTotal || 0) + 1; },
    async scanStats(slugs) { return Object.fromEntries(slugs.map((s) => [s, { scans30: scans.filter((x) => x === s).length, scansThisMonth: scans.filter((x) => x === s).length }])); },
    async dailyScans() { return []; },
  };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, location: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.redirect = (c, l) => { res.statusCode = c; res.location = l; return res; };
  return res;
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const REVIEW = "https://g.page/r/CabcDEF123/review";

test("only Google review links are accepted (no open redirect)", () => {
  assert.equal(isGoogleReviewUrl(REVIEW), true);
  assert.equal(isGoogleReviewUrl("https://search.google.com/local/writereview?placeid=abc"), true);
  assert.equal(isGoogleReviewUrl("https://maps.app.goo.gl/xyz"), true);
  assert.equal(isGoogleReviewUrl("https://www.google.de/maps/place/x"), true);
  assert.equal(isGoogleReviewUrl("http://g.page/r/abc"), false);
  assert.equal(isGoogleReviewUrl("https://evil.com/?q=google.com"), false);
  assert.equal(isGoogleReviewUrl("https://google.com.evil.com/"), false);
  assert.equal(isGoogleReviewUrl("https://user:pw@g.page/r/x"), false);
  assert.equal(isGoogleReviewUrl("javascript:alert(1)"), false);
});

test("slugs are generated from German company names", () => {
  assert.equal(slugify("Bäckerei Müller & Söhne, Höxter"), "baeckerei-mueller-soehne-hoexter");
  assert.equal(validateCustomerInput({ firma: "Friseur Weiß", googleUrl: REVIEW }).slug, "friseur-weiss");
  assert.ok(validateCustomerInput({ firma: "X", googleUrl: REVIEW, slug: "Ungültig!" }).error);
});

test("link previews and bots are not counted as scans", () => {
  assert.equal(isCountableScan({ method: "GET", userAgent: IPHONE }), true);
  assert.equal(isCountableScan({ method: "HEAD", userAgent: IPHONE }), false);
  assert.equal(isCountableScan({ method: "GET", userAgent: "WhatsApp/2.23" }), false);
  assert.equal(isCountableScan({ method: "GET", userAgent: "Googlebot/2.1" }), false);
  assert.equal(isCountableScan({ method: "GET", userAgent: "" }), false);
  assert.match(dayKey(new Date("2026-11-22T23:30:00Z")), /^2026-11-23$/); // Berliner Zeit
});

test("active customer: scan is counted and redirected to Google", async () => {
  const store = memoryStore();
  await store.createCustomer({ slug: "baeckerei-schmidt", firma: "Bäckerei Schmidt", googleUrl: REVIEW, active: true });
  const res = mockRes();
  await createRedirectHandler(store)({ method: "GET", query: { slug: "baeckerei-schmidt" }, headers: { "user-agent": IPHONE } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, REVIEW);
  assert.deepEqual(store.scans, ["baeckerei-schmidt"]);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("inactive or unknown customers are not redirected", async () => {
  const store = memoryStore();
  await store.createCustomer({ slug: "pending-firma", firma: "P", googleUrl: REVIEW, active: false, status: "pending" });
  const r1 = mockRes();
  await createRedirectHandler(store)({ method: "GET", query: { slug: "pending-firma" }, headers: { "user-agent": IPHONE } }, r1);
  assert.equal(r1.statusCode, 410);
  const r2 = mockRes();
  await createRedirectHandler(store)({ method: "GET", query: { slug: "gibts-nicht" }, headers: { "user-agent": IPHONE } }, r2);
  assert.equal(r2.statusCode, 404);
  assert.equal(store.scans.length, 0);
});

test("a failing scan counter never blocks the redirect", async () => {
  const store = memoryStore();
  await store.createCustomer({ slug: "firma", firma: "F", googleUrl: REVIEW, active: true });
  store.recordScan = async () => { throw new Error("DB down"); };
  const res = mockRes();
  const orig = console.error; console.error = () => {};
  await createRedirectHandler(store)({ method: "GET", query: { slug: "firma" }, headers: { "user-agent": IPHONE } }, res);
  console.error = orig;
  assert.equal(res.statusCode, 302);
});

test("public requests are stored as pending and cannot activate themselves", async () => {
  const store = memoryStore();
  const res = mockRes();
  await createCustomerHandler(store)({ method: "POST", headers: {}, body: { firma: "Friseur Weiß", googleUrl: REVIEW, active: true } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(store.customers.get("friseur-weiss").active, false);
  assert.equal(store.customers.get("friseur-weiss").status, "pending");
});

test("customer list and changes require the CRM login", async () => {
  const store = memoryStore();
  const handler = createCustomerHandler(store);
  const anon = mockRes();
  await handler({ method: "GET", headers: {}, query: {} }, anon);
  assert.equal(anon.statusCode, 401);

  await store.createCustomer({ slug: "firma", firma: "F", googleUrl: REVIEW, active: false, status: "pending" });
  const put = mockRes();
  await handler({ method: "PUT", headers: { cookie: adminCookie() }, body: { slug: "firma", active: true } }, put);
  assert.equal(put.statusCode, 200);
  assert.equal(store.customers.get("firma").active, true);

  const list = mockRes();
  await handler({ method: "GET", headers: { cookie: adminCookie() }, query: {} }, list);
  assert.equal(list.body.customers[0].shortUrl, "https://weserads.de/r/firma");
});

test("admin cannot set a non-Google target link", async () => {
  const store = memoryStore();
  await store.createCustomer({ slug: "firma", firma: "F", googleUrl: REVIEW, active: true });
  const res = mockRes();
  await createCustomerHandler(store)({ method: "PUT", headers: { cookie: adminCookie() }, body: { slug: "firma", googleUrl: "https://evil.com" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(store.customers.get("firma").googleUrl, REVIEW);
});

test("honeypot silently drops bot submissions", async () => {
  const store = memoryStore();
  const res = mockRes();
  await createCustomerHandler(store)({ method: "POST", headers: {}, body: { firma: "Spam", googleUrl: REVIEW, website: "http://spam" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(store.customers.size, 0);
});

test("duplicate public requests get a free short name and trigger a notification", async () => {
  const store = memoryStore();
  const sent = [];
  const handler = createCustomerHandler(store, async (c) => { sent.push(c.slug); });
  await store.createCustomer({ slug: "friseur-weiss", firma: "Alt", googleUrl: REVIEW, active: true });
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { firma: "Friseur Weiß", googleUrl: REVIEW, slug: "friseur-weiss" } }, res);
  assert.equal(res.statusCode, 201);
  assert.ok(store.customers.has("friseur-weiss-2"));
  assert.equal(store.customers.get("friseur-weiss").firma, "Alt");
  assert.deepEqual(sent, ["friseur-weiss-2"]);
});
