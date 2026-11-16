import { ObjectId } from "mongodb";
import { hashPassword, requireAdmin } from "./_auth.js";
import { collection } from "./_db.js";

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt
  };
}

function validUsername(value) {
  return /^[A-Za-z0-9._-]{3,50}$/.test(value);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const users = await collection("crm_users");
    if (req.method === "GET") {
      const rows = await users.find({}).sort({ createdAt: 1 }).toArray();
      return res.status(200).json(rows.map(publicUser));
    }
    if (req.method === "POST") {
      const { username, name, password } = req.body || {};
      const normalizedUsername = String(username || "").trim();
      if (!validUsername(normalizedUsername)) return res.status(400).json({ error: "Der Benutzername muss 3 bis 50 Zeichen enthalten und darf nur Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich enthalten." });
      if (String(password || "").length < 12) return res.status(400).json({ error: "Das Passwort muss mindestens 12 Zeichen lang sein." });
      if (!String(name || "").trim()) return res.status(400).json({ error: "Der Name ist erforderlich." });
      if (normalizedUsername === process.env.CRM_ADMIN_USERNAME) return res.status(409).json({ error: "Dieser Benutzername ist bereits für den Admin reserviert." });
      if (await users.findOne({ username: normalizedUsername })) return res.status(409).json({ error: "Dieser Benutzername existiert bereits." });
      const record = {
        username: normalizedUsername,
        name: String(name).trim(),
        passwordHash: await hashPassword(password),
        role: "user",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await users.insertOne(record);
      return res.status(201).json(publicUser({ ...record, _id: result.insertedId }));
    }
    if (req.method !== "PATCH") return res.status(405).json({ error: "Methode nicht erlaubt." });
    const id = req.query?.id;
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: "Ungültige Benutzer-ID." });
    const input = req.body || {};
    const update = { updatedAt: new Date() };
    if (typeof input.name === "string" && input.name.trim()) update.name = input.name.trim();
    if (typeof input.active === "boolean") update.active = input.active;
    if (typeof input.password === "string" && input.password) {
      if (input.password.length < 12) return res.status(400).json({ error: "Das Passwort muss mindestens 12 Zeichen lang sein." });
      update.passwordHash = await hashPassword(input.password);
    }
    const result = await users.updateOne({ _id: new ObjectId(id) }, { $set: update });
    if (!result.matchedCount) return res.status(404).json({ error: "Benutzer nicht gefunden." });
    return res.status(200).json(publicUser(await users.findOne({ _id: new ObjectId(id) })));
  } catch (error) {
    console.error("CRM-Benutzerverwaltung fehlgeschlagen", error);
    return res.status(500).json({ error: "Die Benutzerverwaltung ist momentan nicht verfügbar." });
  }
}
