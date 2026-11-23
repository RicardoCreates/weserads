import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

function setup(systemDark, stored) {
  const store = stored ? { "weserads-theme": stored } : {};
  const styles = ["light", "dark"].map((name) => ({ dataset: { themeStyle: name }, media: "" }));
  let click, ready;
  const button = { setAttribute() {}, getAttribute: () => "", addEventListener: (_, fn) => { click = fn; } };
  const root = { dataset: {} }, system = { matches: systemDark, addEventListener: (_, fn) => { system.change = fn; } };
  const document = { documentElement: root, addEventListener: (_, fn) => { ready = fn; },
    querySelectorAll: (s) => s === "[data-theme-style]" ? styles : s === ".theme-toggle" ? [button] : [] };
  const window = { matchMedia: () => system, addEventListener() {}, localStorage: {
    getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } } };
  runInNewContext(read("assets/theme.js"), { window, document });
  ready();
  return { root, store, styles, system, click: () => click() };
}

test("the website follows the system until the visitor chooses", () => {
  const page = setup(true);
  assert.equal(page.root.dataset.theme, "dark");
  assert.deepEqual(page.styles.map((s) => s.media), ["not all", "all"]);
  page.system.matches = false; page.system.change();
  assert.equal(page.root.dataset.theme, "light");
});

test("a manual choice is remembered and can return to the system setting", () => {
  const page = setup(false);
  page.click();
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.store["weserads-theme"], "dark");
  page.click();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.store["weserads-theme"], undefined);
  assert.equal(setup(true, "light").root.dataset.theme, "light");
});

test("all public pages load the theme script and offer a toggle", () => {
  for (const name of ["index.html", "google-ads-betreuung.html", "impressum.html", "datenschutz.html", "crm.html"]) {
    const html = read(name);
    assert.match(html, /assets\/theme\.js/);
    assert.match(html, /class="theme-toggle"/);
    assert.match(html, name === "crm.html" ? /html\[data-theme="light"\]/ : /data-theme-style="dark"/);
  }
});
