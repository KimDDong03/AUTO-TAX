import test from "node:test";
import assert from "node:assert/strict";
import {
  createCertificateUploadSessionMetadata,
  isPfxPasswordMismatchMessage,
  isAllowedLocalRenewalHelperOrigin,
  uploadedCertificateMatchesBridge
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

test("isPfxPasswordMismatchMessage classifies Windows P12 password failures", () => {
  assert.equal(
    isPfxPasswordMismatchMessage("Exception calling .ctor: 지정된 네트워크 암호가 맞지 않습니다."),
    true
  );
  assert.equal(isPfxPasswordMismatchMessage("AUTO_TAX_P12_PASSWORD_MISMATCH"), true);
  assert.equal(isPfxPasswordMismatchMessage("인증서 가져오기 중에 문제가 발생하였습니다. (375848960)"), false);
});

test("uploadedCertificateMatchesBridge matches decimal P12 serial to hexadecimal bridge serial", () => {
  assert.equal(
    uploadedCertificateMatchesBridge(
      {
        cn: "유학현()001168920230227111003787",
        issuerToName: "알 수 없음",
        usageToName: "전자세금용",
        todate: "2027-03-02T14:59:00.000Z",
        detailValidateTo: "2027-03-02T14:59:00.000Z",
        serial: "919115189",
        userDN: "CN=유학현()001168920230227111003787"
      } as never,
      {
        cn: "유학현",
        issuerToName: "cn=yessignCA Class 3,ou=AccreditedCA,o=yessign,c=kr",
        usageToName: "전자세금용",
        todate: "2027-03-02",
        detailValidateTo: "2027-03-02",
        serial: "36c895b5",
        userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr"
      } as never
    ),
    true
  );
});
