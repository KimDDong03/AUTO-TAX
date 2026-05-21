import assert from "node:assert/strict";
import test from "node:test";
import { parseOpsAdminEmailsFromRaw } from "./supabase.js";

test("parseOpsAdminEmailsFromRaw accepts common Vercel environment value formats", () => {
  const parsed = parseOpsAdminEmailsFromRaw(`
    "Admin@Example.com";
    ops@example.com, support@example.com
    'owner@example.com'
  `);

  assert.deepEqual([...parsed].sort(), [
    "admin@example.com",
    "ops@example.com",
    "owner@example.com",
    "support@example.com"
  ]);
});
