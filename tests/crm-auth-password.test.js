import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, passwordHash, verifyPassword } from "../api/crm/_auth.js";

test("CRM user passwords use salted scrypt hashes", async () => {
  const password = "a-long-test-password";
  const storedHash = await hashPassword(password);

  assert.match(storedHash, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword(password, storedHash), true);
  assert.equal(await verifyPassword("incorrect-password", storedHash), false);
});

test("legacy CRM password hashes remain valid for migration", async () => {
  const storedHash = passwordHash("legacy-password");

  assert.equal(await verifyPassword("legacy-password", storedHash), true);
  assert.equal(await verifyPassword("incorrect-password", storedHash), false);
});
