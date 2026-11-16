import { requireAuth } from "../_auth.js";
import { googleRequest } from "../_calendar.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Methode nicht erlaubt." });
  const { title, date, startTime, endTime, customer, location, notes } = req.body || {};
  if (!title || !date || !startTime || !endTime) return res.status(400).json({ error: "Titel, Datum, Startzeit und Endzeit sind erforderlich." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return res.status(400).json({ error: "Datum oder Uhrzeit ist ungültig." });
  }
  if (startTime >= endTime) return res.status(400).json({ error: "Die Endzeit muss nach der Startzeit liegen." });
  try {
    const event = await googleRequest("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({
        summary: String(title).trim(),
        description: [customer, notes].filter(Boolean).join("\n\n"),
        location: String(location || "").trim(),
        start: { dateTime: `${date}T${startTime}:00`, timeZone: "Europe/Berlin" },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: "Europe/Berlin" }
      })
    });
    return res.status(201).json({ id: event.id, htmlLink: event.htmlLink });
  } catch (error) {
    console.error("Google-Kalendertermin konnte nicht erstellt werden", error);
    return res.status(503).json({ error: error.message || "Der Google-Kalender ist momentan nicht erreichbar." });
  }
}
