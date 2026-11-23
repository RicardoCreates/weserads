import { ObjectId } from "mongodb";
import { requireAuth } from "./_auth.js";
import { collection } from "./_db.js";
import { normalize, validStatus, withDefaults } from "./_model.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const customers = await collection("customers");
    if (req.method === "GET") {
      const rows = await customers.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json(rows.map(({ _id, ...row }) => ({ ...withDefaults(row), id: _id.toString() })));
    }
    if (req.method === "POST") {
      const record = {
        ...withDefaults(normalize(req.body)),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (!validStatus(record.status)) return res.status(400).json({ error: "Unbekannter Status." });
      record.statusSeit = new Date().toISOString();
      if (!record.firma) return res.status(400).json({ error: "Der Firmenname ist erforderlich." });
      const result = await customers.insertOne(record);
      return res.status(201).json({ ...record, id: result.insertedId.toString() });
    }
    if (!["PATCH", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Methode nicht erlaubt." });
    const id = req.query?.id;
    if (!id || !ObjectId.isValid(id)) return res.status(400).json({ error: "Ungültige Kunden-ID." });
    if (req.method === "DELETE") {
      await customers.deleteOne({ _id: new ObjectId(id) });
      return res.status(204).end();
    }
    const update = { ...normalize(req.body), updatedAt: new Date() };
    if (update.status === "") delete update.status;
    if (update.status) {
      if (!validStatus(update.status)) return res.status(400).json({ error: "Unbekannter Status." });
      update.statusSeit = new Date().toISOString();
    }
    await customers.updateOne({ _id: new ObjectId(id) }, { $set: update });
    const saved = await customers.findOne({ _id: new ObjectId(id) });
    return res.status(200).json({ ...withDefaults(saved || update), id });
  } catch (error) {
    console.error("CRM-Datenbankfehler", error);
    return res.status(500).json({ error: "Die CRM-Datenbank ist momentan nicht erreichbar." });
  }
}
