import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCertificateBusinessInfoLookupBatchResults,
  createCertificateUploadSessionMetadata,
  isSignGateBusinessInfoFallbackDetail,
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

test("isSignGateBusinessInfoFallbackDetail treats missing media info as fallback-worthy", () => {
  assert.equal(
    isSignGateBusinessInfoFallbackDetail("미디어(장치) 정보가 없습니다. (356712448)"),
    true
  );
  assert.equal(
    isSignGateBusinessInfoFallbackDetail("홈택스 조회 실패: NOTSUPPORTMEDIA"),
    true
  );
  assert.equal(
    isSignGateBusinessInfoFallbackDetail("인증서 비밀번호가 맞지 않습니다."),
    false
  );
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

function makeBusinessInfoResult(overrides: Partial<Awaited<ReturnType<typeof collectCertificateBusinessInfoLookupBatchResults>>[number]> = {}) {
  return {
    ok: false,
    source: "signgate",
    status: "lookup-failed",
    stage: "signgate-preflight",
    certificateIndex: "1",
    certificateCn: "테스트",
    sourcePort: null,
    loginCode: null,
    businessInfoSnapshot: null,
    message: null,
    error: "조회 실패",
    ...overrides
  } as Awaited<ReturnType<typeof collectCertificateBusinessInfoLookupBatchResults>>[number];
}

test("collectCertificateBusinessInfoLookupBatchResults runs SignGate first and sends only fallback-worthy rows to HomeTax", async () => {
  const homeTaxCalls: string[] = [];
  const results = await collectCertificateBusinessInfoLookupBatchResults(
    [
      { certificateIndex: 1, certificateCn: "signgate-ok", certificatePassword: "secret" },
      { certificateIndex: 2, certificateCn: "fallback-ok", certificatePassword: "secret", issuerToName: "yessign" },
      { certificateIndex: 3, certificateCn: "password-error", certificatePassword: "secret" },
      { certificateIndex: 4, certificateCn: "hometax-not-registered", certificatePassword: "secret", issuerToName: "yessign" }
    ],
    {
      signGateConcurrency: 16,
      homeTaxConcurrency: 5,
      lookupSignGate: async (payload) => {
        if (payload.certificateCn === "signgate-ok") {
          return makeBusinessInfoResult({
            ok: true,
            source: "signgate",
            status: "complete",
            businessInfoSnapshot: {
              companyName: "SignGate",
              businessNumber: "1111111111",
              ceoName: null,
              bizType: null,
              bizClass: null,
              businessFieldCode: null,
              postalCode: null,
              baseAddress: "서울",
              detailAddress: null,
              contactName: null,
              contactDepartment: null,
              contactEmail: null,
              contactTel: null,
              contactFax: null,
              contactMobile: null
            }
          });
        }
        if (payload.certificateCn === "password-error") {
          return makeBusinessInfoResult({
            status: "password-error",
            error: "인증서 비밀번호가 맞지 않습니다."
          });
        }
        return makeBusinessInfoResult({
          status: "unsupported",
          error: "갱신 가능한 공동인증서가 아닙니다."
        });
      },
      lookupHomeTax: async (payload) => {
        homeTaxCalls.push(String(payload.certificateCn));
        if (payload.certificateCn === "fallback-ok") {
          return makeBusinessInfoResult({
            ok: true,
            source: "hometax",
            status: "complete",
            stage: "business-info",
            businessInfoSnapshot: {
              companyName: "HomeTax",
              businessNumber: "2222222222",
              ceoName: null,
              bizType: null,
              bizClass: null,
              businessFieldCode: null,
              postalCode: null,
              baseAddress: "부산",
              detailAddress: null,
              contactName: null,
              contactDepartment: null,
              contactEmail: null,
              contactTel: null,
              contactFax: null,
              contactMobile: null
            }
          }) as never;
        }
        return makeBusinessInfoResult({
          source: "hometax",
          status: "hometax-not-registered",
          stage: "hometax-login",
          error: "[ETINFZ0109]홈택스에 등록된 인증서가 아닙니다."
        }) as never;
      }
    }
  );

  assert.deepEqual(homeTaxCalls, ["fallback-ok", "hometax-not-registered"]);
  assert.equal(results[0]?.source, "signgate");
  assert.equal(results[1]?.source, "hometax");
  assert.equal(results[1]?.ok, true);
  assert.equal(results[2]?.status, "password-error");
  assert.equal(results[2]?.source, "signgate");
  assert.equal(results[3]?.status, "hometax-not-registered");
  assert.match(results[3]?.error ?? "", /홈택스에 등록되지 않은 인증서/);
  assert.match(results[3]?.error ?? "", /SignGate:/);
});

test("collectCertificateBusinessInfoLookupBatchResults caps SignGate and HomeTax fallback concurrency independently", async () => {
  let activeSignGate = 0;
  let maxSignGate = 0;
  let activeHomeTax = 0;
  let maxHomeTax = 0;
  const requests = Array.from({ length: 20 }, (_, index) => ({
    certificateIndex: index + 1,
    certificateCn: `테스트${index + 1}`,
    certificatePassword: "secret",
    issuerToName: "yessign"
  }));

  const results = await collectCertificateBusinessInfoLookupBatchResults(requests, {
    signGateConcurrency: 16,
    homeTaxConcurrency: 5,
    lookupSignGate: async (payload) => {
      activeSignGate += 1;
      maxSignGate = Math.max(maxSignGate, activeSignGate);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeSignGate -= 1;
      return makeBusinessInfoResult({
        certificateIndex: String(payload.certificateIndex),
        certificateCn: payload.certificateCn ?? null,
        status: "unsupported",
        error: "갱신 가능한 공동인증서가 아닙니다."
      });
    },
    lookupHomeTax: async (payload) => {
      activeHomeTax += 1;
      maxHomeTax = Math.max(maxHomeTax, activeHomeTax);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeHomeTax -= 1;
      return makeBusinessInfoResult({
        ok: true,
        source: "hometax",
        status: "complete",
        stage: "business-info",
        certificateIndex: String(payload.certificateIndex),
        certificateCn: payload.certificateCn ?? null,
        businessInfoSnapshot: {
          companyName: payload.certificateCn ?? null,
          businessNumber: String(payload.certificateIndex).padStart(10, "0"),
          ceoName: null,
          bizType: null,
          bizClass: null,
          businessFieldCode: null,
          postalCode: null,
          baseAddress: "서울",
          detailAddress: null,
          contactName: null,
          contactDepartment: null,
          contactEmail: null,
          contactTel: null,
          contactFax: null,
          contactMobile: null
        }
      }) as never;
    }
  });

  assert.equal(results.length, 20);
  assert.equal(results.every((result) => result.ok && result.source === "hometax"), true);
  assert.equal(maxSignGate, 16);
  assert.equal(maxHomeTax, 5);
});
