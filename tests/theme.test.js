import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

function setup(stored) {
  const store = stored ? { "weserads-theme": stored } : {};
  const styles = ["light", "dark"].map((name) => ({ dataset: { themeStyle: name }, media: "" }));
  let ready;
  const root = { dataset: {} };
  const document = { documentElement: root, addEventListener: (_, fn) => { ready = fn; }, querySelectorAll: (s) => s === "[data-theme-style]" ? styles : [] };
  const window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } } };
  runInNewContext(read("assets/theme.js"), { window, document });
  ready();
  return { root, store, styles };
}

test("the public website is always light, even after an old dark choice", () => {
  const page = setup("dark");
  assert.equal(page.root.dataset.theme, "light");
  assert.deepEqual(page.styles.map((s) => s.media), ["all", "not all"]);
  assert.equal(page.store["weserads-theme"], undefined);
});

test("public pages offer no dark mode toggle, the CRM stays dark", () => {
  for (const name of ["index.html", "google-ads-betreuung.html", "impressum.html", "datenschutz.html"]) {
    const html = read(name);
    assert.match(html, /assets\/theme\.js/);
    assert.doesNotMatch(html, /class="theme-toggle"/);
  }
  assert.match(read("crm.html"), /root\.dataset\.theme !== "dark"/);
});
