import { requireAdmin } from "./_auth.js";
import { collection } from "./_db.js";
import { prepareRecords } from "./_model.js";

// Sichert den alten Bestand in eine eigene Collection, bevor er ersetzt wird.
export async function replaceAll(open, records, now = new Date()) {
  const customers = await open("customers");
  const old = await customers.find({}).toArray();
  const backupName = `customers_backup_${now.toISOString().replace(/[^0-9]/g, "").slice(0, 17)}`;
  if (old.length) {
    const result = await (await open(backupName)).insertMany(old);
    if (result.insertedCount !== old.length) throw new Error("Sicherung unvollständig.");
  }
  // Erst einfügen, dann genau die alten Datensätze löschen: bricht etwas ab, geht nichts verloren.
  await customers.insertMany(records);
  if (old.length) await customers.deleteMany({ _id: { $in: old.map((row) => row._id) } });
  return { imported: records.length, removed: old.length, backup: old.length ? backupName : null };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") {
      const rows = await (await collection("customers")).find({}).sort({ createdAt: -1 }).toArray();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(rows.map(({ _id, ...row }) => row));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Methode nicht erlaubt." });
    if (req.body?.confirm !== "ERSETZEN") return res.status(400).json({ error: "Bestätigung fehlt." });
    let records;
    try { records = prepareRecords(req.body.records); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    return res.status(200).json(await replaceAll(collection, records));
  } catch (error) {
    console.error("CRM-Sicherung/Import fehlgeschlagen", error);
    return res.status(500).json({ error: "Sicherung oder Import ist fehlgeschlagen. Es wurde nichts gelöscht, was nicht gesichert ist." });
  }
}
