// QR-Code für einen Kunden-Magnet. Kodiert nur den Kurzlink weserads.de/r/<slug>,
// darum ohne Datenbank und ohne Login abrufbar.
import QRCode from "qrcode";
import { SLUG_PATTERN, shortUrl } from "./_core.js";

export default async function qr(req, res) {
  const slug = String(req.query?.slug || "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) return res.status(400).send("Ungültiger Kurzname.");

  const format = req.query?.format === "png" ? "png" : "svg";
  const options = { errorCorrectionLevel: "M", margin: 2, color: { dark: "#0A1931", light: "#FFFFFF" } };
  const url = shortUrl(slug);

  res.setHeader("Cache-Control", "public, max-age=86400");
  if (format === "png") {
    const width = Math.min(Math.max(Number(req.query?.size) || 1200, 200), 3000);
    const buffer = await QRCode.toBuffer(url, { ...options, type: "png", width });
    res.setHeader("Content-Type", "image/png");
    if (req.query?.download) res.setHeader("Content-Disposition", `attachment; filename="qr-${slug}.png"`);
    return res.status(200).send(buffer);
  }
  const svg = await QRCode.toString(url, { ...options, type: "svg" });
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  return res.status(200).send(svg);
}
