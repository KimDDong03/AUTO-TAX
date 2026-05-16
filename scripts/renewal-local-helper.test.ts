import test from "node:test";
import assert from "node:assert/strict";
import {
  createCertificateUploadSessionMetadata,
  isAllowedLocalRenewalHelperOrigin
} from "./renewal-local-helper.ts";

test("isAllowedLocalRenewalHelperOrigin allows the production KIYO domains by default", () => {
  assert.equal(isAllowedLocalRenewalHelperOrigin("https://kiyo.kr"), true);
  assert.equal(isAllowedLocalRenewalHelperOrigin("https://www.kiyo.kr"), true);
  assert.equal(isAllowedLocalRenewalHelperOrigin("https://auto-tax-alpha.vercel.app"), false);
});

test("createCertificateUploadSessionMetadata reports missing signCert.der without raw persistence", () => {
  const result = createCertificateUploadSessionMetadata([
    {
      name: "memo.txt",
      relativePath: "NPKI/user/memo.txt",
      base64: Buffer.from("not a certificate").toString("base64")
    }
  ]);

  assert.equal(result.certificates.length, 0);
  assert.equal(result.rejectedFiles.length, 0);
  assert.match(result.warnings.join("\n"), /signCert\.der/);
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/i);
});

test("createCertificateUploadSessionMetadata rejects unreadable signCert.der", () => {
  const result = createCertificateUploadSessionMetadata([
    {
      name: "signCert.der",
      relativePath: "NPKI/KICA/USER/signCert.der",
      base64: Buffer.from("not a certificate").toString("base64")
    },
    {
      name: "signPri.key",
      relativePath: "NPKI/KICA/USER/signPri.key",
      base64: Buffer.from("private key placeholder").toString("base64")
    }
  ]);

  assert.equal(result.certificates.length, 0);
  assert.deepEqual(result.rejectedFiles, [
    {
      name: "signCert.der",
      relativePath: "NPKI/KICA/USER/signCert.der",
      reason: "인증서 파일을 읽지 못했습니다."
    }
  ]);
});
