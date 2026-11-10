import crypto from "node:crypto";

const cookieName = "weserads_crm_session";

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function expected(value, configured) {
  const actual = Buffer.from(value);
  const target = Buffer.from(configured || "");
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

export function passwordHash(value) {
  return hash(value);
}

export function setSession(res) {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac("sha256", process.env.CRM_SESSION_SECRET).update(issuedAt).digest("hex");
  res.setHeader("Set-Cookie", `${cookieName}=${issuedAt}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function isAuthenticated(req) {
  const raw = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return false;
  const [issuedAt, signature] = raw.split(".");
  if (!issuedAt || !signature || Date.now() / 1000 - Number(issuedAt) > 28800) return false;
  const expectedSignature = crypto.createHmac("sha256", process.env.CRM_SESSION_SECRET).update(issuedAt).digest("hex");
  return expected(signature, expectedSignature);
}

export function requireAuth(req, res) {
  if (process.env.CRM_SESSION_SECRET && isAuthenticated(req)) return true;
  res.status(401).json({ error: "Nicht autorisiert." });
  return false;
}

