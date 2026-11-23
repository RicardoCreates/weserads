import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("expired Google consent asks for reconnecting and the button stays available", () => {
  const calendar = readFileSync(new URL("../api/crm/_calendar.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../crm.html", import.meta.url), "utf8");
  assert.match(calendar, /invalid_grant/);
  assert.match(html, /"hidden", !status\.configured\)/);
});
