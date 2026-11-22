// E-Mail an WeserAds, wenn über die Einrichtungsseite eine Anfrage eingeht.
import nodemailer from "nodemailer";

const recipient = "kontakt@weserads.de";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

export async function notifyNewRequest({ firma, googleUrl, kontakt, slug }) {
  if (!process.env.IONOS_SMTP_PASSWORD) return; // lokal/ohne SMTP einfach überspringen
  const transporter = nodemailer.createTransport({
    host: "smtp.ionos.de", port: 465, secure: true,
    auth: { user: recipient, pass: process.env.IONOS_SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from: recipient,
    to: recipient,
    subject: `Kunden-Magnet: neue Anfrage von ${firma}`,
    html: `<h2>Neue Kunden-Magnet-Anfrage</h2>
      <p><strong>Firma:</strong> ${esc(firma)}<br>
      <strong>Kontakt:</strong> ${esc(kontakt || "nicht angegeben")}<br>
      <strong>Google-Link:</strong> ${esc(googleUrl)}<br>
      <strong>Kurzlink nach Freischaltung:</strong> https://weserads.de/r/${esc(slug)}</p>
      <p>Freischalten unter <a href="https://weserads.de/Weserads-Kunden-Magnet-admin">Kunden-Magnet Verwaltung</a>.</p>`,
  });
}
