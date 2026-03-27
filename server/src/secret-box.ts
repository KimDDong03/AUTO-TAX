import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "enc:v1";
const IV_LENGTH = 12;

function readSecretMaterial(): string {
  const configured =
    process.env.AUTO_TAX_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!configured) {
    throw new Error("AUTO_TAX_ENCRYPTION_KEY 또는 서버 비밀키 환경변수가 필요합니다.");
  }

  return configured;
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(readSecretMaterial()).digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(`${SECRET_PREFIX}:`));
}

export function encryptSecret(value: string | null | undefined): string {
  const plain = value ?? "";
  if (plain === "") {
    return "";
  }

  if (isEncryptedSecret(plain)) {
    return plain;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${SECRET_PREFIX}:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  const raw = value ?? "";
  if (raw === "") {
    return "";
  }

  if (!isEncryptedSecret(raw)) {
    return raw;
  }

  const [, version, encodedIv, encodedTag, encodedPayload] = raw.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedPayload) {
    throw new Error("암호화된 비밀값 형식이 올바르지 않습니다.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}
