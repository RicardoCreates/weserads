export const STATUSES = ["Lead", "Erstkontakt", "Interesse geweckt", "Termin vereinbart", "Ads-Check / Beratung", "Angebot versendet", "Nachfassen", "Kunde", "Verloren"];
const LEGACY = { "Neu": "Lead", "Angerufen": "Erstkontakt", "Check geschickt": "Ads-Check / Beratung", "Angebot": "Angebot versendet", "Abgesagt": "Verloren" };
const FIELDS = [
  "leadId", "firma", "branche", "adresse", "kontakt", "telefon", "email", "ort",
  "googleLink", "googleAdsStatus", "schaltetAds", "tracking", "status", "prioritaet",
  "produkt", "notiz", "letzterKontakt", "naechsterSchritt", "naechstesDatum",
  "quelle", "rechercheDatum", "wert", "farbe",
  "label", "kontaktweg", "empfehlung", "bewertung", "weitereKontakte", "verlustgrund", "statusSeit"
];

export const mapStatus = (value) => LEGACY[value] || value;

export function normalize(input) {
  const record = Object.fromEntries(
    FIELDS.filter((field) => typeof input?.[field] === "string").map((field) => [field, input[field].trim()])
  );
  if (record.status) record.status = mapStatus(record.status);
  if (Array.isArray(input?.aktivitaeten)) record.aktivitaeten = input.aktivitaeten;
  if (Array.isArray(input?.aufgaben)) record.aufgaben = input.aufgaben;
  return record;
}

export function withDefaults(row) {
  return {
    ...row,
    status: mapStatus(row.status) || "Lead",
    produkt: row.produkt || "",
    aktivitaeten: Array.isArray(row.aktivitaeten) ? row.aktivitaeten : [],
    aufgaben: Array.isArray(row.aufgaben) ? row.aufgaben : []
  };
}

export const validStatus = (value) => STATUSES.includes(value);

export function prepareRecords(input, now = new Date()) {
  if (!Array.isArray(input) || !input.length) throw new Error("Die Datei enthält keine Datensätze.");
  if (input.length > 2000) throw new Error("Maximal 2000 Datensätze pro Import.");
  return input.map((raw, index) => {
    const record = withDefaults(normalize(raw));
    if (!record.firma) throw new Error(`Datensatz ${index + 1}: Der Firmenname fehlt.`);
    if (!validStatus(record.status)) throw new Error(`${record.firma}: Unbekannter Status „${record.status}“.`);
    const created = new Date(raw.createdAt || now);
    return { ...record, createdAt: Number.isNaN(created.getTime()) ? now : created, updatedAt: now };
  });
}
