import { clearSession, passwordHash, setSession } from "./_auth.js";

export default function handler(req, res) {
  if (req.method === "DELETE") {
    clearSession(res);
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Methode nicht erlaubt." });
  const { username, password } = req.body || {};
  const valid = username === process.env.CRM_ADMIN_USERNAME &&
    passwordHash(password || "") === process.env.CRM_ADMIN_PASSWORD_HASH;
  if (!valid) return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
  setSession(res);
  return res.status(204).end();
}

