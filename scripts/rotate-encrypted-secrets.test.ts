import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecretWithMaterial, encryptSecretWithMaterial } from "../server/src/secret-box.js";
import { rotateSecretValue } from "./rotate-encrypted-secrets.js";

test("rotateSecretValue re-encrypts an old-key secret with the new key", () => {
  const encryptedWithOldKey = encryptSecretWithMaterial("mail-password", "old-key");
  const result = rotateSecretValue(encryptedWithOldKey, "old-key", "new-key");

  assert.equal(result.action, "rotate");
  assert.equal(decryptSecretWithMaterial(result.nextValue, "new-key"), "mail-password");
  assert.throws(() => decryptSecretWithMaterial(result.nextValue, "old-key"));
});

test("rotateSecretValue keeps values that are already encrypted with the new key", () => {
  const encryptedWithNewKey = encryptSecretWithMaterial("mail-password", "new-key");
  const result = rotateSecretValue(encryptedWithNewKey, "old-key", "new-key");

  assert.equal(result.action, "already-current");
  assert.equal(result.nextValue, encryptedWithNewKey);
});

test("rotateSecretValue encrypts legacy plaintext values with the new key", () => {
  const result = rotateSecretValue("plain-password", "old-key", "new-key");

  assert.equal(result.action, "rotate");
  assert.equal(decryptSecretWithMaterial(result.nextValue, "new-key"), "plain-password");
});
