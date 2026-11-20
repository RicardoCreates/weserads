import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("important pages have distinct canonical URLs and are listed in the sitemap", () => {
  const sitemap = read("sitemap.xml");
  for (const [file, url] of [
    ["index.html", "https://weserads.de/"],
    ["google-ads-betreuung.html", "https://weserads.de/google-ads-betreuung"]
  ]) {
    const html = read(file);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
    assert.ok(sitemap.includes(`<loc>${url}</loc>`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/i);
  }
  assert.match(read("robots.txt"), /Sitemap: https:\/\/weserads\.de\/sitemap\.xml/);
});

test("service page is discoverable and links to existing contact, pricing and method sections", () => {
  const home = read("index.html");
  const service = read("google-ads-betreuung.html");
  assert.match(home, /href="\/google-ads-betreuung"/);
  for (const anchor of ["kontakt", "pakete", "methode"]) {
    assert.ok(service.includes(`href="/#${anchor}"`));
    assert.ok(home.includes(`id="${anchor}"`));
  }
  assert.match(service, /<script src="assets\/google-consent\.js"><\/script>/);
});
