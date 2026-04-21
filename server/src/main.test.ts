import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedCorsOrigin } from "./main.js";

test("isAllowedCorsOrigin accepts localhost dev origins on non-default Vite ports", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5174", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://127.0.0.1:4173", new Set()), true);
  assert.equal(isAllowedCorsOrigin("http://[::1]:5175", new Set()), true);
});

test("isAllowedCorsOrigin still rejects unrelated origins unless explicitly allowed", () => {
  assert.equal(isAllowedCorsOrigin("https://example.test", new Set()), false);
  assert.equal(
    isAllowedCorsOrigin("https://preview.example.test", new Set(["https://preview.example.test"])),
    true
  );
});
