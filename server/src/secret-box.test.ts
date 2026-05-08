import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecretWithMaterial, encryptSecret, encryptSecretWithMaterial } from "./secret-box.js";

test("encryptSecret requires a dedicated encryption key in production", () => {
  const previousEncryptionKey = process.env.AUTO_TAX_ENCRYPTION_KEY;
  const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousNodeEnv = process.env.NODE_ENV;

  delete process.env.AUTO_TAX_ENCRYPTION_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fallback";
  process.env.NODE_ENV = "production";

  try {
    assert.throws(() => encryptSecret("secret"), /AUTO_TAX_ENCRYPTION_KEY/);
  } finally {
    if (previousEncryptionKey === undefined) {
      delete process.env.AUTO_TAX_ENCRYPTION_KEY;
    } else {
      process.env.AUTO_TAX_ENCRYPTION_KEY = previousEncryptionKey;
    }

    if (previousServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("explicit key material helpers can decrypt only with the matching key", () => {
  const encrypted = encryptSecretWithMaterial("secret", "dedicated-key");

  assert.equal(decryptSecretWithMaterial(encrypted, "dedicated-key"), "secret");
  assert.throws(() => decryptSecretWithMaterial(encrypted, "other-key"));
});
