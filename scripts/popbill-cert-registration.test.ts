import test from "node:test";
import assert from "node:assert/strict";
import {
  getPopbillDebugArtifactSupport,
  matchPopbillCandidateIdentifiers,
  pickPopbillCertificateCandidate,
  summarizePopbillChooserDebugReadiness,
  type PopbillCertificateIframeCandidate,
  type PopbillCertificateSelectionDetailProbe
} from "./popbill-cert-registration.ts";

function createCandidate(
  overrides: Partial<PopbillCertificateIframeCandidate> = {}
): PopbillCertificateIframeCandidate {
  return {
    selector: "body > div:nth-of-type(1)",
    text: "한빛태양광",
    attributes: [],
    hiddenValues: [],
    matchedIdentifiers: [],
    ...overrides
  };
}

function createSelectionDetailProbe(
  overrides: Partial<PopbillCertificateSelectionDetailProbe> = {}
): PopbillCertificateSelectionDetailProbe {
  return {
    selector: "body > div:nth-of-type(1)",
    matchedIdentifiers: [],
    evidence: [],
    ...overrides
  };
}

test("pickPopbillCertificateCandidate prefers a unique serial metadata match", () => {
  const result = pickPopbillCertificateCandidate({
    targetSerial: "SERIAL-KEEP",
    candidates: [
      createCandidate({
        selector: "body > div:nth-of-type(1)",
        matchedIdentifiers: []
      }),
      createCandidate({
        selector: "body > div:nth-of-type(2)",
        matchedIdentifiers: ["serial"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: "body > div:nth-of-type(2)",
    reason: "iframe DOM metadata matched serial"
  });
});

test("pickPopbillCertificateCandidate falls back to a single visible CN match", () => {
  const result = pickPopbillCertificateCandidate({
    candidates: [createCandidate({ selector: "body > table:nth-of-type(1) > tr:nth-of-type(2)" })]
  });

  assert.deepEqual(result, {
    selector: "body > table:nth-of-type(1) > tr:nth-of-type(2)",
    reason: "single visible CN match"
  });
});

test("pickPopbillCertificateCandidate keeps the safe failure when duplicate CN candidates remain ambiguous", () => {
  const result = pickPopbillCertificateCandidate({
    targetSerial: "SERIAL-KEEP",
    targetUserDN: "USER-DN-KEEP",
    candidates: [
      createCandidate({ selector: "body > div:nth-of-type(1)" }),
      createCandidate({ selector: "body > div:nth-of-type(2)" })
    ]
  });

  assert.deepEqual(result, {
    selector: null,
    reason: null
  });
});

test("pickPopbillCertificateCandidate can recover from duplicate CN rows when selection details expose a unique serial match", () => {
  const result = pickPopbillCertificateCandidate({
    targetSerial: "SERIAL-KEEP",
    candidates: [
      createCandidate({ selector: "body > tr:nth-of-type(1)" }),
      createCandidate({ selector: "body > tr:nth-of-type(2)" })
    ],
    selectionDetailProbes: [
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(1)",
        matchedIdentifiers: []
      }),
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: ["serial"],
        evidence: ["selected:text:SERIAL-KEEP"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: "body > tr:nth-of-type(2)",
    reason: "iframe selection detail matched serial"
  });
});

test("pickPopbillCertificateCandidate keeps failing closed when selection details still match multiple duplicate rows", () => {
  const result = pickPopbillCertificateCandidate({
    targetUserDN: "USER-DN-KEEP",
    candidates: [
      createCandidate({ selector: "body > tr:nth-of-type(1)" }),
      createCandidate({ selector: "body > tr:nth-of-type(2)" })
    ],
    selectionDetailProbes: [
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(1)",
        matchedIdentifiers: ["userDN"]
      }),
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: ["userDN"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: null,
    reason: null
  });
});

test("matchPopbillCandidateIdentifiers ignores generic row ids as certificate index evidence", () => {
  const matchedIdentifiers = matchPopbillCandidateIdentifiers({
    targetIndex: "1",
    evidenceValues: ["chain0:id=row1dataTable", "desc:title=한빛태양광"]
  });

  assert.deepEqual(matchedIdentifiers, []);
});

test("matchPopbillCandidateIdentifiers accepts explicit certificate index fields", () => {
  const matchedIdentifiers = matchPopbillCandidateIdentifiers({
    targetIndex: "17",
    evidenceValues: ["field:name=certificateIndex=value=17", "chain1:data-certid=17"]
  });

  assert.deepEqual(matchedIdentifiers, ["certificateIndex"]);
});

test("pickPopbillCertificateCandidate fails closed when certificate index and serial point to different rows", () => {
  const result = pickPopbillCertificateCandidate({
    targetIndex: "17",
    targetSerial: "SERIAL-KEEP",
    candidates: [
      createCandidate({
        selector: "body > tr:nth-of-type(1)",
        matchedIdentifiers: ["certificateIndex"]
      }),
      createCandidate({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: []
      })
    ],
    selectionDetailProbes: [
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: ["serial"],
        evidence: ["selected:text:SERIAL-KEEP"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: null,
    reason: null
  });
});

test("pickPopbillCertificateCandidate fails closed when metadata and selection detail disagree on the same serial", () => {
  const result = pickPopbillCertificateCandidate({
    targetSerial: "SERIAL-KEEP",
    candidates: [
      createCandidate({
        selector: "body > tr:nth-of-type(1)",
        matchedIdentifiers: ["serial"]
      }),
      createCandidate({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: []
      })
    ],
    selectionDetailProbes: [
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: ["serial"],
        evidence: ["selected:text:SERIAL-KEEP"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: null,
    reason: null
  });
});

test("summarizePopbillChooserDebugReadiness reports blocked when electronic-tax CNs are all unique", () => {
  const result = summarizePopbillChooserDebugReadiness([
    {
      index: "2",
      cn: "정해능 발전소",
      usageToName: "전자세금용",
      userDN: "USER-DN-2"
    },
    {
      index: "4",
      cn: "정혜원 발전소",
      usageToName: "전자세금용",
      userDN: "USER-DN-4"
    },
    {
      index: "1",
      cn: "사업자 범용",
      usageToName: "사업자(범용)",
      userDN: "USER-DN-1"
    }
  ]);

  assert.deepEqual(result, {
    electronicTaxCertificateCount: 2,
    duplicateElectronicTaxCnCount: 0,
    ambiguousCnReady: false,
    duplicateElectronicTaxCnCandidates: [],
    blockers: ["duplicate-electronic-tax-cn-missing", "valid-popbill-cert-url-not-yet-verified"],
    nextAction:
      "같은 CN의 전자세금용 공동인증서가 있는 PC/브리지에서 상태를 다시 확인한 뒤, 실제 Popbill cert-url 발급 가능 상태를 검증하세요.",
    message: "현재 로컬 브리지 전자세금용 공동인증서에는 같은 CN 중복이 없어 ambiguous-cn-match live 재현이 불가능합니다."
  });
});

test("summarizePopbillChooserDebugReadiness reports duplicate electronic-tax CN groups", () => {
  const result = summarizePopbillChooserDebugReadiness([
    {
      index: "2",
      cn: "정해능 발전소",
      usageToName: "전자세금용",
      userDN: "USER-DN-2"
    },
    {
      index: "5",
      cn: "정해능 발전소",
      usageToName: "전자세금용",
      userDN: "USER-DN-5"
    },
    {
      index: "7",
      cn: "황해구 발전소",
      usageToName: "전자세금용",
      userDN: "USER-DN-7"
    }
  ]);

  assert.deepEqual(result, {
    electronicTaxCertificateCount: 3,
    duplicateElectronicTaxCnCount: 1,
    ambiguousCnReady: true,
    duplicateElectronicTaxCnCandidates: [
      {
        certificateCn: "정해능 발전소",
        certificateIndices: ["2", "5"],
        userDNs: ["USER-DN-2", "USER-DN-5"]
      }
    ],
    blockers: ["valid-popbill-cert-url-not-yet-verified"],
    nextAction: "이제 실제 Popbill cert-url 발급이 되는 workspace/customer에서 live Child.html artifact를 확보하세요.",
    message: "같은 CN의 전자세금용 공동인증서가 1개 그룹 있어 ambiguous-cn-match live 재현이 가능합니다."
  });
});

test("getPopbillDebugArtifactSupport exposes the default artifact directory and stages", () => {
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousArtifactDir = process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;
  process.env.LOCALAPPDATA = "C:\\Users\\Fixture\\AppData\\Local";
  delete process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;

  try {
    assert.deepEqual(getPopbillDebugArtifactSupport(), {
      supported: true,
      artifactDir: "C:\\Users\\Fixture\\AppData\\Local\\AUTO-TAX\\popbill-cert-debug",
      stages: ["no-visible-cn-match", "ambiguous-cn-match", "registration-confirmation-failed"]
    });
  } finally {
    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }

    if (previousArtifactDir === undefined) {
      delete process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;
    } else {
      process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR = previousArtifactDir;
    }
  }
});

test("getPopbillDebugArtifactSupport honors the explicit artifact directory override", () => {
  const previousArtifactDir = process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;
  process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR = ".\\tmp\\popbill-artifacts";

  try {
    assert.deepEqual(getPopbillDebugArtifactSupport(), {
      supported: true,
      artifactDir: `${process.cwd()}\\tmp\\popbill-artifacts`,
      stages: ["no-visible-cn-match", "ambiguous-cn-match", "registration-confirmation-failed"]
    });
  } finally {
    if (previousArtifactDir === undefined) {
      delete process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;
    } else {
      process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR = previousArtifactDir;
    }
  }
});
