// Kunden-Magnet: Datenhaltung in der bestehenden MongoDB des CRM.
import { collection } from "../crm/_db.js";
import { dayKey } from "./_core.js";

const CUSTOMERS = "magnet_customers";
const SCANS = "magnet_scans";
let indexesReady;

async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = Promise.all([
      collection(CUSTOMERS).then((c) => c.createIndex({ slug: 1 }, { unique: true })),
      collection(SCANS).then((c) => c.createIndex({ slug: 1, day: 1 }, { unique: true })),
    ]).catch((error) => {
      indexesReady = undefined;
      throw error;
    });
  }
  return indexesReady;
}

function daysAgo(n) {
  return dayKey(new Date(Date.now() - n * 86400000));
}

export const mongoStore = {
  async findCustomer(slug) {
    await ensureIndexes();
    return (await collection(CUSTOMERS)).findOne({ slug }, { projection: { _id: 0 } });
  },

  async createCustomer(doc) {
    await ensureIndexes();
    try {
      await (await collection(CUSTOMERS)).insertOne({ ...doc });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false; // Kurzname schon vergeben
      throw error;
    }
  },

  async updateCustomer(slug, fields) {
    await ensureIndexes();
    // MongoDB-Treiber v6 liefert direkt das aktualisierte Dokument (oder null).
    return (await collection(CUSTOMERS)).findOneAndUpdate(
      { slug },
      { $set: fields },
      { returnDocument: "after", projection: { _id: 0 } }
    );
  },

  async listCustomers() {
    await ensureIndexes();
    return (await collection(CUSTOMERS)).find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  },

  async recordScan(slug, now = new Date()) {
    await ensureIndexes();
    await Promise.all([
      (await collection(CUSTOMERS)).updateOne({ slug }, { $inc: { scansTotal: 1 }, $set: { lastScanAt: now.toISOString() } }),
      (await collection(SCANS)).updateOne({ slug, day: dayKey(now) }, { $inc: { count: 1 } }, { upsert: true }),
    ]);
  },

  // Scans je Kunde: letzte 30 Tage und laufender Monat.
  async scanStats(slugs) {
    await ensureIndexes();
    const today = dayKey();
    const from30 = daysAgo(29);
    const monthStart = `${today.slice(0, 7)}-01`;
    const from = from30 < monthStart ? from30 : monthStart;
    const rows = await (await collection(SCANS)).find({ slug: { $in: slugs }, day: { $gte: from } }).toArray();
    const stats = {};
    for (const row of rows) {
      const s = (stats[row.slug] ||= { scans30: 0, scansThisMonth: 0 });
      if (row.day >= from30) s.scans30 += row.count;
      if (row.day >= monthStart) s.scansThisMonth += row.count;
    }
    return stats;
  },

  async dailyScans(slug, days = 90) {
    await ensureIndexes();
    const rows = await (await collection(SCANS))
      .find({ slug, day: { $gte: daysAgo(days - 1) } }, { projection: { _id: 0, day: 1, count: 1 } })
      .sort({ day: 1 })
      .toArray();
    return rows;
  },
};
