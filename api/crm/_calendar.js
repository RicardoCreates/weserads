import crypto from "node:crypto";
import { collection } from "./_db.js";

const tokenId = "primary";

function key() {
  if (!process.env.CRM_SESSION_SECRET) throw new Error("CRM_SESSION_SECRET ist nicht gesetzt.");
  return crypto.createHash("sha256").update(process.env.CRM_SESSION_SECRET).digest();
}

export function redirectUri(req) {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `https://${req.headers.host}/api/crm/calendar/oauth?action=callback`;
}

export function createOAuthState() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const value = `${timestamp}.${nonce}`;
  const signature = crypto.createHmac("sha256", key()).update(value).digest("hex");
  return `${value}.${signature}`;
}

export function validOAuthState(value) {
  const [timestamp, nonce, signature] = String(value || "").split(".");
  if (!timestamp || !nonce || !signature || Date.now() / 1000 - Number(timestamp) > 600) return false;
  const expected = crypto.createHmac("sha256", key()).update(`${timestamp}.${nonce}`).digest("hex");
  return Buffer.from(signature).length === Buffer.from(expected).length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value) {
  const [iv, tag, encrypted] = String(value || "").split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function saveTokens(tokens) {
  const tokensCollection = await collection("google_calendar_tokens");
  const record = {
    _id: tokenId,
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
    accessToken: tokens.access_token ? encrypt(tokens.access_token) : undefined,
    expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : 0,
    updatedAt: new Date()
  };
  Object.keys(record).forEach((field) => record[field] === undefined && delete record[field]);
  await tokensCollection.updateOne({ _id: tokenId }, { $set: record }, { upsert: true });
}

export async function getTokens() {
  const tokensCollection = await collection("google_calendar_tokens");
  const record = await tokensCollection.findOne({ _id: tokenId });
  if (!record) return null;
  return {
    access_token: record.accessToken ? decrypt(record.accessToken) : "",
    refresh_token: record.refreshToken ? decrypt(record.refreshToken) : "",
    expires_at: record.expiresAt || 0
  };
}

export async function googleRequest(url, options = {}) {
  let tokens = await getTokens();
  if (!tokens?.refresh_token) throw new Error("Google Kalender ist noch nicht verbunden.");
  if (!tokens.access_token || tokens.expires_at < Date.now() + 60000) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token"
      })
    });
    const refreshed = await response.json();
    if (!response.ok || !refreshed.access_token) {
      console.error("Google-Token konnte nicht erneuert werden", response.status, refreshed.error);
      throw new Error(refreshed.error === "invalid_grant"
        ? "Die Google-Freigabe ist abgelaufen. Bitte unter CRM/Admin den Google Kalender neu verbinden."
        : `Google Kalender konnte nicht authentifiziert werden (${refreshed.error || response.status}).`);
    }
    await saveTokens({ ...refreshed, refresh_token: tokens.refresh_token });
    tokens = {...tokens, access_token: refreshed.access_token, expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000};
  }
  const response = await fetch(url, {
    ...options,
    headers: {"Authorization": `Bearer ${tokens.access_token}`, "Content-Type": "application/json", ...(options.headers || {})}
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Google-Calendar-Anfrage fehlgeschlagen", response.status, details);
    throw new Error("Google Kalender hat die Anfrage abgelehnt.");
  }
  return response.status === 204 ? null : response.json();
}
