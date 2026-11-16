import crypto from "node:crypto";
import { promisify } from "node:util";

const cookieName = "weserads_crm_session";
export const calendarSessionCookieName = "weserads_google_oauth_session";
const scrypt = promisify(crypto.scrypt);
const passwordKeyLength = 64;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

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

export async function hashPassword(value) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(value, salt, passwordKeyLength, scryptOptions);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(value, storedHash) {
  if (typeof storedHash !== "string") return false;
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    return expected(hash(value), storedHash.toLowerCase());
  }

  const [algorithm, encodedSalt, encodedKey, ...extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey || extra.length) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  if (salt.length !== 16 || expectedKey.length !== passwordKeyLength) return false;

  const actualKey = await scrypt(value, salt, passwordKeyLength, scryptOptions);
  return crypto.timingSafeEqual(actualKey, expectedKey);
}

export function isLegacyPasswordHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function sessionInput(issuedAt, username, role) {
  return `${issuedAt}.${Buffer.from(username).toString("base64url")}.${role}`;
}

export function setSession(res, identity = { username: process.env.CRM_ADMIN_USERNAME || "Admin", role: "admin" }) {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const username = identity.username;
  const encodedUsername = Buffer.from(username).toString("base64url");
  const role = identity.role;
  const signature = crypto.createHmac("sha256", process.env.CRM_SESSION_SECRET).update(sessionInput(issuedAt, username, role)).digest("hex");
  res.setHeader("Set-Cookie", `${cookieName}=${issuedAt}.${encodedUsername}.${role}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", [
    `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    `${calendarSessionCookieName}=; Path=/api/crm/calendar/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  ]);
}

export function getSessionCookie(req, name = cookieName) {
  return req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function getSession(req, name = cookieName) {
  const raw = getSessionCookie(req, name);
  if (!raw) return null;
  const parts = raw.split(".");
  const [issuedAt, encodedUsername, role, signature] = parts;
  if (parts.length === 2) {
    const [legacyIssuedAt, legacySignature] = parts;
    if (!legacyIssuedAt || !legacySignature || Date.now() / 1000 - Number(legacyIssuedAt) > 28800) return null;
    const expectedSignature = crypto.createHmac("sha256", process.env.CRM_SESSION_SECRET).update(legacyIssuedAt).digest("hex");
    return expected(legacySignature, expectedSignature)
      ? { username: process.env.CRM_ADMIN_USERNAME || "Admin", role: "admin" }
      : null;
  }
  if (!issuedAt || !encodedUsername || !role || !signature || Date.now() / 1000 - Number(issuedAt) > 28800) return null;
  let username;
  try { username = Buffer.from(encodedUsername, "base64url").toString("utf8"); } catch { return null; }
  const expectedSignature = crypto.createHmac("sha256", process.env.CRM_SESSION_SECRET).update(sessionInput(issuedAt, username, role)).digest("hex");
  return expected(signature, expectedSignature) ? { username, role } : null;
}

export function requireAuth(req, res) {
  if (process.env.CRM_SESSION_SECRET && getSession(req)) return true;
  res.status(401).json({ error: "Nicht autorisiert." });
  return false;
}

export function requireAdmin(req, res) {
  const session = process.env.CRM_SESSION_SECRET && getSession(req);
  if (session?.role === "admin") return true;
  res.status(403).json({ error: "Nur der CRM-Admin darf Benutzer verwalten." });
  return false;
}

