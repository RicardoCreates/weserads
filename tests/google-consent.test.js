import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../assets/google-consent.js", import.meta.url), "utf8");
const key = "weserads-google-ads-analytics-consent";

function createPage({ saved, legacy, ads = false } = {}) {
  const values = new Map();
  if (saved !== undefined) values.set(key, saved);
  if (legacy !== undefined) values.set("weserads-google-ads-consent", legacy);
  const scripts = [];
  const body = [];
  const events = {};
  const windowEvents = {};
  const buttons = ["denied", "granted"].map((value) => ({
    dataset: { adsConsent: value },
    addEventListener(name, callback) { this[name] = callback; }
  }));
  const settings = { addEventListener(name, callback) { this[name] = callback; } };
  const document = {
    currentScript: { hasAttribute: () => ads },
    head: { appendChild: (element) => scripts.push(element) },
    body: { appendChild: (element) => body.push(element) },
    createElement(tag) {
      return {
        tag,
        setAttribute() {},
        addEventListener(name, callback) { this[name] = callback; },
        querySelectorAll: () => buttons
      };
    },
    getElementById: () => settings,
    addEventListener(name, callback) { events[name] = callback; }
  };
  const window = {
    localStorage: {
      getItem: (name) => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value)
    },
    addEventListener(name, callback) { windowEvents[name] = callback; }
  };
  runInNewContext(source, { window, document, console, Date });
  events.DOMContentLoaded();
  return { window, windowEvents, scripts, banner: body[0], buttons, settings, values };
}

test("legacy Ads consent does not grant Analytics or load Google", () => {
  const page = createPage({ legacy: "granted", ads: true });
  assert.equal(page.banner.hidden, false);
  assert.equal(page.scripts.length, 0);
  assert.equal(page.window.dataLayer[0][2].analytics_storage, "denied");
});

test("combined consent loads GTM and existing Ads only once, then supports withdrawal", () => {
  const page = createPage({ ads: true });
  page.buttons[1].click();
  assert.equal(page.values.get(key), "granted");
  assert.equal(page.window.weserAdsAdsConsent, true);
  assert.equal(page.window.dataLayer[1][2].analytics_storage, "granted");
  assert.deepEqual(page.scripts.map((script) => script.src), [
    "https://www.googletagmanager.com/gtm.js?id=GTM-W7TT3GZ6",
    "https://www.googletagmanager.com/gtag/js?id=AW-18579248744"
  ]);
  page.settings.click();
  assert.equal(page.banner.hidden, false);
  page.buttons[0].click();
  assert.equal(page.window.weserAdsAdsConsent, false);
  assert.equal(page.window.dataLayer.at(-1)[2].analytics_storage, "denied");
  page.buttons[1].click();
  assert.equal(page.scripts.length, 2);
});

test("saved consent works on other public pages and changes propagate between tabs", () => {
  const page = createPage({ saved: "granted" });
  assert.equal(page.banner.hidden, true);
  assert.equal(page.scripts.length, 1);
  assert.match(page.scripts[0].src, /GTM-W7TT3GZ6/);
  page.values.set(key, "denied");
  page.windowEvents.storage({ key });
  assert.equal(page.window.weserAdsAdsConsent, false);
  assert.equal(page.window.dataLayer.at(-1)[2].analytics_storage, "denied");
  page.values.delete(key);
  page.windowEvents.storage({ key });
  assert.equal(page.banner.hidden, false);
});

test("only public pages include the shared consent script", () => {
  for (const name of ["index.html", "datenschutz.html", "impressum.html",
    "Weserads-Kunden-Magnet.html", "Weserads-Kunden-Magnet-anfrage.html", "indexWeserAds1.0.html"]) {
    const html = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.match(html, /<head>\s*<script src="assets\/google-consent\.js"/);
    assert.match(html, /assets\/google-consent\.css/);
  }
  for (const name of ["crm.html", "Weserads-Kunden-Magnet-admin.html"]) {
    const html = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /google-consent\.js/);
  }
});
