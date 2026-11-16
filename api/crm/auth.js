import { clearSession, getSession, hashPassword, isLegacyPasswordHash, setSession, verifyPassword } from "./_auth.js";
import { collection } from "./_db.js";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    clearSession(res);
    return res.status(204).end();
  }
  if (req.method === "GET") {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: "Nicht autorisiert." });
    return res.status(200).json(session);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Methode nicht erlaubt." });
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || "").trim();
  const adminValid = normalizedUsername === process.env.CRM_ADMIN_USERNAME &&
    await verifyPassword(password || "", process.env.CRM_ADMIN_PASSWORD_HASH || "");
  if (adminValid) {
    setSession(res, { username: normalizedUsername, role: "admin" });
    return res.status(204).end();
  }
  try {
    const users = await collection("crm_users");
    const user = await users.findOne({ username: normalizedUsername, active: true });
    if (!user || !await verifyPassword(password || "", user.passwordHash)) {
      return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
    }
    if (isLegacyPasswordHash(user.passwordHash)) {
      await users.updateOne(
        { _id: user._id },
        { $set: { passwordHash: await hashPassword(password || ""), updatedAt: new Date() } }
      );
    }
    setSession(res, { username: user.username, role: user.role });
    return res.status(204).end();
  } catch (error) {
    console.error("CRM-Benutzerprüfung fehlgeschlagen", error);
    return res.status(500).json({ error: "Die Benutzeranmeldung ist momentan nicht verfügbar." });
  }
}

