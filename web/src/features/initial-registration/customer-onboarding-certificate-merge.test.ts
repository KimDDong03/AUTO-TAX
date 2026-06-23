import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCustomerOnboardingTemplateWorkbookState,
  mergeOnboardingCertificates
} from "./customer-onboarding-certificate-merge";
import type { CustomerOnboardingTemplateWorkbookInput } from "./customer-onboarding-workbook";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";

function createCertificate(overrides: Partial<RenewalAgentCertificate> = {}): RenewalAgentCertificate {
  return {
    index: "1",
    cn: "기존 발전소",
    subjectDN: "",
    policy: "",
    issuerDN: "",
    oid: "1.2.410.200005.1.1.5",
    type: "",
    class1: "",
    class2: "",
    status: "",
    certDate: "",
    todate: "2099-12-31",
    fromdate: "",
    issuerToName: "테스트 기관",
    subjectToName: "",
    usageToName: "전자세금용",
    source: "browser",
    cloud: false,
    detailValidateTo: "2099-12-31",
    validateFrom: "2024-01-01",
    serial: null,
    userDN: null,
    certDirPath: null,
    ...overrides
  } as RenewalAgentCertificate;
}

test("mergeOnboardingCertificates keeps bridge and uploaded certificates when their local indexes collide", () => {
  const bridgeCertificate = createCertificate({
    index: "1",
    cn: "기존 발전소",
    issuerToName: "브리지 기관",
    usageToName: "전자세금용"
  });
  const uploadedCertificate = createCertificate({
    index: "1",
    cn: "추가 발전소",
    issuerToName: "업로드 기관",
    usageToName: "전자세금용",
    uploadSessionId: "upload-session-1",
    relativePath: "NPKI/signCert.der",
    listSource: "upload-session",
    supportsPreflight: false
  } as Partial<RenewalAgentCertificate>);

  const merged = mergeOnboardingCertificates([bridgeCertificate], [uploadedCertificate]);

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((certificate) => certificate.cn),
    ["기존 발전소", "추가 발전소"]
  );
});

test("mergeOnboardingCertificates keeps uploaded p12 duplicate metadata so stale bridge rows can be prepared again", () => {
  const bridgeCertificate = createCertificate({
    index: "7",
    cn: "유학현()001168920230227111003787",
    issuerToName: "cn=yessignCA Class 3,ou=AccreditedCA,o=yessign,c=kr",
    usageToName: "전자세금용",
    todate: "2027-03-02",
    detailValidateTo: "2027-03-02",
    serial: "36c895b5",
    userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr"
  });
  const uploadedCertificate = createCertificate({
    index: "upload-1",
    cn: "유학현()001168920230227111003787",
    issuerToName: "알 수 없음",
    usageToName: "전자세금용",
    todate: "2027-03-02T14:59:00.000Z",
    detailValidateTo: "2027-03-02T14:59:00.000Z",
    serial: "919115189",
    userDN: "CN=유학현()001168920230227111003787",
    uploadSessionId: "upload-session-1",
    relativePath: "Downloads/유학현()001168920230227111003787.p12",
    listSource: "upload-session",
    supportsPreflight: false
  } as Partial<RenewalAgentCertificate>);

  const merged = mergeOnboardingCertificates([bridgeCertificate], [uploadedCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "upload-1");
  assert.equal(merged[0]?.supportsPreflight, false);
  assert.equal("uploadSessionId" in merged[0] ? merged[0].uploadSessionId : null, "upload-session-1");
});

test("mergeOnboardingCertificates keeps uploaded NPKI folder duplicate until bridge path is prepared", () => {
  const bridgeLikeCertificate = createCertificate({
    index: "7",
    cn: "김수용발전소",
    issuerToName: "테스트 기관",
    usageToName: "전자세금용",
    todate: "2027-03-02",
    detailValidateTo: "2027-03-02",
    serial: "36c895b5",
    userDN: "cn=김수용발전소,ou=xUse4Esero,o=SignGate,c=kr",
    listSource: "ml4web-hdd",
    supportsPreflight: true,
    certDirPath: null
  } as Partial<RenewalAgentCertificate>);
  const uploadedCertificate = createCertificate({
    index: "upload-1",
    cn: "김수용발전소",
    issuerToName: "테스트 기관",
    usageToName: "전자세금용",
    todate: "2027-03-02",
    detailValidateTo: "2027-03-02",
    serial: "36c895b5",
    userDN: "cn=김수용발전소,ou=xUse4Esero,o=SignGate,c=kr",
    uploadSessionId: "upload-session-1",
    relativePath: "NPKI/SignKorea/USER/김수용발전소/signCert.der",
    listSource: "upload-session",
    supportsPreflight: false
  } as Partial<RenewalAgentCertificate>);

  const merged = mergeOnboardingCertificates([bridgeLikeCertificate], [uploadedCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "upload-1");
  assert.equal(merged[0]?.supportsPreflight, false);
});

test("mergeOnboardingCertificates keeps uploaded NPKI folder metadata even when a stale prepared bridge row exists", () => {
  const bridgeCertificate = createCertificate({
    index: "7",
    cn: "김수용발전소",
    issuerToName: "테스트 기관",
    usageToName: "전자세금용",
    todate: "2027-03-02",
    detailValidateTo: "2027-03-02",
    serial: "36c895b5",
    userDN: "cn=김수용발전소,ou=xUse4Esero,o=SignGate,c=kr",
    certDirPath: "C:\\Users\\User\\AppData\\LocalLow\\NPKI\\SignKorea\\USER\\김수용발전소",
    listSource: "bridge-hdd",
    supportsPreflight: true
  } as Partial<RenewalAgentCertificate>);
  const uploadedCertificate = createCertificate({
    index: "upload-1",
    cn: "김수용발전소",
    issuerToName: "테스트 기관",
    usageToName: "전자세금용",
    todate: "2027-03-02",
    detailValidateTo: "2027-03-02",
    serial: "36c895b5",
    userDN: "cn=김수용발전소,ou=xUse4Esero,o=SignGate,c=kr",
    uploadSessionId: "upload-session-1",
    relativePath: "NPKI/SignKorea/USER/김수용발전소/signCert.der",
    listSource: "upload-session",
    supportsPreflight: false
  } as Partial<RenewalAgentCertificate>);

  const merged = mergeOnboardingCertificates([bridgeCertificate], [uploadedCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "upload-1");
  assert.equal(merged[0]?.supportsPreflight, false);
  assert.equal("uploadSessionId" in merged[0] ? merged[0].uploadSessionId : null, "upload-session-1");
});

test("mergeOnboardingCertificates replaces an uploaded duplicate when a bridge certificate is read later", () => {
  const uploadedCertificate = createCertificate({
    index: "upload-1",
    cn: "하달용()001168320230206111003340",
    issuerToName: "알 수 없음",
    usageToName: "전자세금용",
    todate: "2027-02-06T14:59:00.000Z",
    detailValidateTo: "2027-02-06T14:59:00.000Z",
    serial: "1746391616",
    userDN: "CN=하달용()001168320230206111003340",
    uploadSessionId: "upload-session-1",
    relativePath: "Downloads/하달용()001168320230206111003340.p12",
    listSource: "upload-session",
    supportsPreflight: false
  } as Partial<RenewalAgentCertificate>);
  const bridgeCertificate = createCertificate({
    index: "8",
    cn: "하달용()001168320230206111003340",
    issuerToName: "cn=yessignCA Class 3,ou=AccreditedCA,o=yessign,c=kr",
    usageToName: "전자세금용",
    todate: "2027-02-06",
    detailValidateTo: "2027-02-06",
    serial: "6817d240",
    userDN: "cn=하달용()001168320230206111003340,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr"
  });

  const merged = mergeOnboardingCertificates([uploadedCertificate], [bridgeCertificate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.index, "8");
  assert.notEqual(merged[0]?.index, "upload-1");
});

test("mergeCustomerOnboardingTemplateWorkbookState preserves existing row selection and passwords", () => {
  const current: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "1",
        certificateName: "기존 발전소",
        plantName: "기존 발전소",
        certificatePassword: "old-password",
        selected: true
      }
    ]
  };
  const next: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "1",
        certificateName: "기존 발전소",
        plantName: "기존 발전소",
        certificatePassword: "",
        selected: false
      },
      {
        rowIndex: 3,
        certificateIndex: "2",
        certificateName: "추가 발전소",
        plantName: "추가 발전소",
        certificatePassword: "",
        selected: false
      }
    ]
  };

  const merged = mergeCustomerOnboardingTemplateWorkbookState(current, next);

  assert.equal(merged.plants.length, 2);
  assert.equal(merged.plants[0]?.selected, true);
  assert.equal(merged.plants[0]?.certificatePassword, "old-password");
  assert.equal(merged.plants[1]?.selected, false);
});

test("mergeCustomerOnboardingTemplateWorkbookState preserves row state when upload metadata changes the certificate index", () => {
  const current: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "7",
        certificateName: "김수용발전소",
        plantName: "김수용발전소",
        certificatePassword: "row-password",
        selected: true
      }
    ]
  };
  const next: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "upload-abc",
        certificateName: "김수용발전소",
        plantName: "김수용발전소",
        certificatePassword: "",
        selected: false
      }
    ]
  };

  const merged = mergeCustomerOnboardingTemplateWorkbookState(current, next);

  assert.equal(merged.plants[0]?.selected, true);
  assert.equal(merged.plants[0]?.certificatePassword, "row-password");
});

test("mergeCustomerOnboardingTemplateWorkbookState can reset selection while keeping passwords", () => {
  const current: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "1",
        certificateName: "기존 발전소",
        plantName: "기존 발전소",
        certificatePassword: "old-password",
        selected: true
      }
    ]
  };
  const next: CustomerOnboardingTemplateWorkbookInput = {
    certificates: [],
    plants: [
      {
        rowIndex: 2,
        certificateIndex: "1",
        certificateName: "기존 발전소",
        plantName: "기존 발전소",
        certificatePassword: "",
        selected: false
      }
    ]
  };

  const merged = mergeCustomerOnboardingTemplateWorkbookState(current, next, {
    preserveSelection: false
  });

  assert.equal(merged.plants[0]?.selected, false);
  assert.equal(merged.plants[0]?.certificatePassword, "old-password");
});
