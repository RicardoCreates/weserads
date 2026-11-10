const nodemailer = require('nodemailer');

const recipient = 'kontakt@weserads.de';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { name, unternehmen, telefon, website, nachricht } = request.body || {};
  if (!name || !telefon || !nachricht) {
    return response.status(400).json({ error: 'Name, Telefonnummer und Nachricht sind erforderlich.' });
  }

  if (!process.env.IONOS_SMTP_PASSWORD) {
    console.error('IONOS_SMTP_PASSWORD is not configured.');
    return response.status(503).json({ error: 'Formularversand ist derzeit nicht konfiguriert.' });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.ionos.de',
    port: 465,
    secure: true,
    auth: {
      user: recipient,
      pass: process.env.IONOS_SMTP_PASSWORD
    }
  });

  const details = [
    `<strong>Name:</strong> ${escapeHtml(name)}`,
    `<strong>Unternehmen:</strong> ${escapeHtml(unternehmen || 'Nicht angegeben')}`,
    `<strong>Telefon:</strong> ${escapeHtml(telefon)}`,
    `<strong>Website:</strong> ${escapeHtml(website || 'Nicht angegeben')}`,
    `<strong>Nachricht:</strong><br>${escapeHtml(nachricht).replaceAll('\n', '<br>')}`
  ].join('<br><br>');

  try {
    await transporter.sendMail({
      from: recipient,
      to: recipient,
      subject: `Neue Anfrage über weserads.de: ${name}`,
      html: `<h2>Neue Anfrage über weserads.de</h2>${details}`
    });
    return response.status(200).json({ success: true });
  } catch (error) {
    console.error('IONOS form delivery failed:', error);
    return response.status(502).json({ error: 'E-Mail konnte nicht versendet werden.' });
  }
};
