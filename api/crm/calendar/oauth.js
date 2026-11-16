import { calendarSessionCookieName, getSession, getSessionCookie, requireAdmin } from "../_auth.js";
import { createOAuthState, getTokens, redirectUri, saveTokens, validOAuthState } from "../_calendar.js";

function configurationError(res) {
  return res.status(503).json({ error: "Google Kalender ist noch nicht konfiguriert. Bitte zuerst die Google-OAuth-Umgebungsvariablen hinterlegen." });
}

export default async function handler(req, res) {
  const action = req.query?.action;
  if (action === "start") {
    if (!requireAdmin(req, res)) return;
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return configurationError(res);
    const state = createOAuthState();
    res.setHeader("Set-Cookie", [
      `weserads_google_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      `${calendarSessionCookieName}=${getSessionCookie(req)}; Path=/api/crm/calendar/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    ]);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(req),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/calendar.events",
      state
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }
  if (action === "callback") {
    if (getSession(req, calendarSessionCookieName)?.role !== "admin") return res.status(403).send("Nur der CRM-Admin darf den Kalender verbinden.");
    const storedState = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("weserads_google_oauth_state="))?.split("=")[1];
    if (!validOAuthState(req.query?.state) || storedState !== req.query?.state) return res.status(400).send("Die Google-Autorisierung ist abgelaufen oder ungültig.");
    if (req.query?.error) return res.status(400).send("Die Google-Kalenderfreigabe wurde abgebrochen.");
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          code: req.query.code || "",
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri(req),
          grant_type: "authorization_code"
        })
      });
      const tokens = await response.json();
      if (!response.ok || !tokens.access_token) return res.status(400).send("Google konnte die Autorisierung nicht bestätigen.");
      await saveTokens(tokens);
      res.setHeader("Set-Cookie", [
        "weserads_google_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        `${calendarSessionCookieName}=; Path=/api/crm/calendar/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
      ]);
      return res.redirect("/crm.html?calendar=connected");
    } catch (error) {
      console.error("Google-Kalenderautorisierung fehlgeschlagen", error);
      return res.status(500).send("Die Google-Kalenderautorisierung ist fehlgeschlagen.");
    }
  }
  if (action === "status") {
    if (!getSession(req)) return res.status(401).json({ error: "Nicht autorisiert." });
    return res.status(200).json({ configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), connected: Boolean(await getTokens()) });
  }
  return res.status(400).json({ error: "Ungültige Kalenderaktion." });
}
