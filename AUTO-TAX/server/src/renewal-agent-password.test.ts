import assert from "node:assert/strict";
import test from "node:test";
import { resolveSelectionPassword } from "./services/renewal-password.js";

test("resolveSelectionPassword uses explicit password from caller", () => {
  assert.equal(resolveSelectionPassword({ certificatePassword: "  test-pass  " }), "test-pass");
});

test("resolveSelectionPassword does not fall back to helper env password", () => {
  const previous = process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD;
  process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD = "env-only-password";

  try {
    assert.equal(resolveSelectionPassword({ certificatePassword: null }), null);
    assert.equal(resolveSelectionPassword(), null);
  } finally {
    if (previous === undefined) {
      delete process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD;
    } else {
      process.env.AUTO_TAX_RENEWAL_AGENT_CERT_PASSWORD = previous;
    }
  }
});
