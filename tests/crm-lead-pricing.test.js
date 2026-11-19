import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("lead imports use the new price without overwriting existing product prices", async () => {
  const html = readFileSync(new URL("../crm.html", import.meta.url), "utf8");
  const start = html.indexOf("    function mapLead(record)");
  const end = html.indexOf('    $("#login-form").onsubmit', start);
  assert.ok(start !== -1 && end !== -1);
  const requests = [];
  const context = {
    rows: [{ id: "existing", leadId: "old", produkt: "Google Ads START 349€" }],
    confirm: () => true,
    request: async (url, options) => requests.push({ url, ...options, body: JSON.parse(options.body) }),
    $: () => ({ textContent: "" }),
    load: async () => {}
  };
  runInNewContext(`${html.slice(start, end)}\nglobalThis.importLeads = importLeads;`, context);

  await context.importLeads({
    name: "leads.json",
    text: async () => JSON.stringify([
      { "Lead-ID": "old", Unternehmen: "Bestand" },
      { "Lead-ID": "new", Unternehmen: "Neu" }
    ])
  });

  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].body.produkt, "Google Ads START 349€");
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].body.produkt, "Google Ads START 399€");
});
