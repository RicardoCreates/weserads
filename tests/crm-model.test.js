import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecords, withDefaults } from "../api/crm/_model.js";
import backup, { replaceAll } from "../api/crm/backup.js";

function fakeDb(initial) {
  const store = { customers: initial };
  const open = async (name) => {
    store[name] ||= [];
    return {
      find: () => ({ toArray: async () => [...store[name]] }),
      insertMany: async (docs) => { store[name].push(...docs); return { insertedCount: docs.length }; },
      deleteMany: async ({ _id }) => { store[name] = store[name].filter((row) => !_id.$in.includes(row._id)); }
    };
  };
  return { store, open };
}

test("old CRM statuses map to the new pipeline", () => {
  assert.equal(withDefaults({ status: "Neu" }).status, "Lead");
  assert.equal(withDefaults({ status: "Angebot" }).status, "Angebot versendet");
  assert.equal(withDefaults({ status: "Abgesagt" }).status, "Verloren");
});

test("records without company or with unknown status are rejected", () => {
  assert.throws(() => prepareRecords([{ firma: "" }]));
  assert.throws(() => prepareRecords([{ firma: "A", status: "Quatsch" }]));
  assert.throws(() => prepareRecords([]));
});

test("replaceAll backs up the old data before removing it", async () => {
  const { store, open } = fakeDb([{ _id: 1, firma: "Alt" }]);
  const result = await replaceAll(open, prepareRecords([{ firma: "Neu GmbH" }]));
  assert.deepEqual(store.customers.map((row) => row.firma), ["Neu GmbH"]);
  assert.equal(store[result.backup][0].firma, "Alt");
});

test("a failed insert keeps the old data", async () => {
  const { store, open } = fakeDb([{ _id: 1, firma: "Alt" }]);
  const failing = async (name) => {
    const c = await open(name);
    return name === "customers" ? { ...c, insertMany: async () => { throw new Error("x"); } } : c;
  };
  await assert.rejects(replaceAll(failing, [{ firma: "Neu" }]));
  assert.equal(store.customers[0].firma, "Alt");
});

test("backup endpoint needs an admin", async () => {
  process.env.CRM_SESSION_SECRET ||= "test-session-secret";
  const res = { status(code) { this.code = code; return this; }, json() { return this; } };
  await backup({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 403);
});
