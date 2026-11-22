// Kunden-Magnet: HTTP-Handler mit austauschbarem Speicher (für Tests).
import { getSession } from "../crm/_auth.js";
import { isCountableScan, publicCustomer, SLUG_PATTERN, validateCustomerInput } from "./_core.js";

function isAdmin(req) {
  return Boolean(process.env.CRM_SESSION_SECRET && getSession(req));
}

function inactivePage(message) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Kunden-Magnet nicht aktiv</title></head>
<body style="font-family:-apple-system,Arial,sans-serif;text-align:center;padding:60px 20px;color:#0A1931">
<h1 style="font-size:22px">Dieser Bewertungslink ist gerade nicht aktiv.</h1>
<p>${message}</p><p style="color:#64748b">Kunden-Magnet von <a href="https://weserads.de">WeserAds</a></p></body></html>`;
}

export function createRedirectHandler(store) {
  return async function redirect(req, res) {
    const slug = String(req.query?.slug || "").trim().toLowerCase();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    if (!SLUG_PATTERN.test(slug)) return res.status(404).send("Nicht gefunden.");

    try {
      const customer = await store.findCustomer(slug);
      if (!customer || !customer.active) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(customer ? 410 : 404).send(inactivePage("Bitte versuchen Sie es später noch einmal."));
      }
      if (isCountableScan({ method: req.method, userAgent: req.headers?.["user-agent"] })) {
        try {
          await store.recordScan(slug);
        } catch (error) {
          console.error("Scan konnte nicht gezählt werden:", error); // Weiterleitung trotzdem ausführen
        }
      }
      return res.redirect(302, customer.googleUrl);
    } catch (error) {
      console.error("Kunden-Magnet Weiterleitung fehlgeschlagen:", error);
      return res.status(503).send("Der Bewertungslink ist momentan nicht erreichbar. Bitte später erneut versuchen.");
    }
  };
}

export function createCustomerHandler(store, notify) {
  return async function customer(req, res) {
    try {
      const body = req.body || {};

      // Öffentliche Einrichtungsanfrage: wird nur als "pending" gespeichert.
      if (req.method === "POST" && !isAdmin(req)) {
        if (body.website) return res.status(201).json({ success: true }); // Honeypot für Bots
        const { slug: _wish, ...publicBody } = body; // Kurzname vergibt WeserAds
        const input = validateCustomerInput(publicBody);
        if (input.error) return res.status(400).json({ error: input.error });
        const now = new Date().toISOString();
        let slug = null;
        for (let n = 1; n <= 9 && !slug; n += 1) {
          const candidate = n === 1 ? input.slug : `${input.slug.slice(0, 57)}-${n}`;
          if (await store.createCustomer({ ...input, slug: candidate, active: false, status: "pending", scansTotal: 0, createdAt: now, updatedAt: now })) slug = candidate;
        }
        if (!slug) return res.status(409).json({ error: "Diese Firma ist bereits angefragt. Wir melden uns bei Ihnen." });
        if (notify) await notify({ ...input, slug }).catch((error) => console.error("Benachrichtigung fehlgeschlagen:", error));
        return res.status(201).json({ success: true, status: "pending" });
      }

      if (!isAdmin(req)) return res.status(401).json({ error: "Bitte im CRM anmelden." });

      if (req.method === "GET") {
        const slug = String(req.query?.slug || "").trim().toLowerCase();
        if (slug) {
          const doc = await store.findCustomer(slug);
          if (!doc) return res.status(404).json({ error: "Kunde nicht gefunden." });
          const [stats, daily] = await Promise.all([store.scanStats([slug]), store.dailyScans(slug, 90)]);
          return res.status(200).json({ customer: publicCustomer(doc, stats[slug]), daily });
        }
        const docs = await store.listCustomers();
        const stats = docs.length ? await store.scanStats(docs.map((d) => d.slug)) : {};
        return res.status(200).json({ customers: docs.map((d) => publicCustomer(d, stats[d.slug])) });
      }

      if (req.method === "POST") {
        const input = validateCustomerInput(body);
        if (input.error) return res.status(400).json({ error: input.error });
        const now = new Date().toISOString();
        const active = body.active === true;
        const created = await store.createCustomer({ ...input, active, status: active ? "active" : "pending", scansTotal: 0, createdAt: now, updatedAt: now });
        if (!created) return res.status(409).json({ error: "Dieser Kurzname ist schon vergeben." });
        return res.status(201).json({ success: true, slug: input.slug });
      }

      if (req.method === "PUT") {
        const slug = String(body.slug || "").trim().toLowerCase();
        if (!SLUG_PATTERN.test(slug)) return res.status(400).json({ error: "Ungültiger Kurzname." });
        const { slug: _ignored, ...rest } = body;
        const input = validateCustomerInput(rest, { partial: true });
        if (input.error) return res.status(400).json({ error: input.error });
        const fields = { ...input, updatedAt: new Date().toISOString() };
        if (typeof body.active === "boolean") {
          fields.active = body.active;
          fields.status = body.active ? "active" : "inactive";
        }
        const updated = await store.updateCustomer(slug, fields);
        if (!updated) return res.status(404).json({ error: "Kunde nicht gefunden." });
        return res.status(200).json({ success: true, customer: publicCustomer(updated) });
      }

      res.setHeader("Allow", "GET, POST, PUT");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    } catch (error) {
      console.error("Kunden-Magnet API fehlgeschlagen:", error);
      return res.status(503).json({ error: "Der Kundenspeicher ist gerade nicht erreichbar." });
    }
  };
}
