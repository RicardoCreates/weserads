// Kunden-Magnet: reine Logik ohne Datenbank (gut testbar).

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PUBLIC_BASE_URL = "https://weserads.de";
const MAX_FIRMA = 120;
const MAX_URL = 500;

// Nur Google-Ziele erlauben, damit /r/... nie als Weiterleitung auf fremde
// (z. B. Phishing-)Seiten missbraucht werden kann.
export function isGoogleReviewUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "g.page" ||
    host === "maps.app.goo.gl" ||
    host === "g.co" ||
    /(^|\.)google\.(com|de|at|ch)$/.test(host)
  );
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function validateCustomerInput(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.slug !== undefined) {
    const slug = String(body.slug || "").trim().toLowerCase() || slugify(body.firma);
    if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
      return { error: "Der Kurzname darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten (max. 60 Zeichen)." };
    }
    out.slug = slug;
  }
  if (!partial || body.firma !== undefined) {
    const firma = String(body.firma || "").trim().replace(/\s+/g, " ");
    if (!firma || firma.length > MAX_FIRMA) return { error: "Bitte einen Firmennamen angeben (max. 120 Zeichen)." };
    out.firma = firma;
  }
  if (!partial || body.googleUrl !== undefined) {
    const googleUrl = String(body.googleUrl || "").trim();
    if (googleUrl.length > MAX_URL || !isGoogleReviewUrl(googleUrl)) {
      return { error: "Bitte den Google-Bewertungslink aus dem Unternehmensprofil verwenden (beginnt z. B. mit https://g.page/r/)." };
    }
    out.googleUrl = googleUrl;
  }
  if (body.kontakt !== undefined) out.kontakt = String(body.kontakt || "").trim().slice(0, 160);
  return out;
}

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|linkedin|embedly|headless|curl|wget|python-requests|httpclient|monitor/i;

// Link-Vorschauen (WhatsApp, Slack …) und Crawler nicht als Scan zählen.
export function isCountableScan({ method, userAgent }) {
  if (method && method.toUpperCase() !== "GET") return false;
  if (!userAgent) return false;
  return !BOT_PATTERN.test(userAgent);
}

// Tagesschlüssel in deutscher Zeit, z. B. "2026-11-22".
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);
}

export function shortUrl(slug) {
  return `${PUBLIC_BASE_URL}/r/${slug}`;
}

export function publicCustomer(doc, stats = {}) {
  return {
    slug: doc.slug,
    firma: doc.firma,
    googleUrl: doc.googleUrl,
    kontakt: doc.kontakt || "",
    active: Boolean(doc.active),
    status: doc.active ? "active" : doc.status === "pending" ? "pending" : "inactive",
    shortUrl: shortUrl(doc.slug),
    scansTotal: doc.scansTotal || 0,
    lastScanAt: doc.lastScanAt || null,
    scans30: stats.scans30 || 0,
    scansThisMonth: stats.scansThisMonth || 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
