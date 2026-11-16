import { ObjectId, MongoClient } from "mongodb";
import { requireAuth } from "./_auth.js";
import { collection } from "./_db.js";

function normalize(input) {
  const fields = [
    "leadId", "firma", "branche", "adresse", "kontakt", "telefon", "email", "ort",
    "googleLink", "googleAdsStatus", "schaltetAds", "tracking", "status", "prioritaet",
    "produkt", "notiz", "letzterKontakt", "naechsterSchritt", "naechstesDatum",
    "quelle", "rechercheDatum", "wert", "farbe"
  ];
  const record = Object.fromEntries(
    fields
      .filter((field) => typeof input?.[field] === "string")
      .map((field) => [field, input[field].trim()])
  );
  if (Array.isArray(input?.aktivitaeten)) record.aktivitaeten = input.aktivitaeten;
  if (Array.isArray(input?.aufgaben)) record.aufgaben = input.aufgaben;
  return record;
}

function withDefaults(row) {
  return {
    ...row,
    status: row.status || "Neu",
    produkt: row.produkt || "Kunden-Magnet 29€",
    aktivitaeten: Array.isArray(row.aktivitaeten) ? row.aktivitaeten : [],
    aufgaben: Array.isArray(row.aufgaben) ? row.aufgaben : []
  };
}

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
    await customers.updateOne({ _id: new ObjectId(id) }, { $set: update });
    const saved = await customers.findOne({ _id: new ObjectId(id) });
    return res.status(200).json({ ...withDefaults(saved || update), id });
  } catch (error) {
    console.error("CRM-Datenbankfehler", error);
    return res.status(500).json({ error: "Die CRM-Datenbank ist momentan nicht erreichbar." });
  }
}
