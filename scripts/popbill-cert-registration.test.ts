import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPopbillCookieHeaderFromSetCookies,
  extractRegistrationError,
  getPopbillDebugArtifactSupport,
  isPopbillHelperHeadlessEnabled,
  matchPopbillCandidateIdentifiers,
  mergePopbillCookieHeaders,
  normalizePopbillBusinessNumber,
  parsePopbillPopupTokenFromUrl,
  pickPopbillCertificateCandidate,
  pickPopbillDirectMagicLineCandidate,
  readPopbillBusinessNumberFromApiBody,
  resolvePopbillBrowserUserDataDir,
  summarizePopbillChooserDebugReadiness,
  type PopbillDirectMagicLineCandidate,
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

function createDirectCandidate(
  overrides: Partial<PopbillDirectMagicLineCandidate> = {}
): PopbillDirectMagicLineCandidate {
  return {
    certificateCn: "한빛태양광",
    serial: "SERIAL-1",
    userDN: "CN=한빛태양광,O=KICA,C=KR",
    targetExpireDate: "2027-01-28",
    validTo: "2027-01-28 23:59:59",
    storageRawCertIdx: {
      storageName: "hdd",
      storageOpt: { hddOpt: { diskname: "fixed" } },
      storageCertIdx: "subkey-1"
    },
    ...overrides
  };
}

test("extractRegistrationError classifies expired certificate dialog signals", () => {
  assert.equal(
    extractRegistrationError("확인\n만료된 공동인증서입니다.\n인증서를 다시 선택하세요."),
    "만료된 공동인증서입니다."
  );
});

test("parsePopbillPopupTokenFromUrl reads query and hash popup tokens", () => {
  assert.equal(
    parsePopbillPopupTokenFromUrl("https://www.popbill.com/App/Taxinvoice/PopUp/Certificate?T=abc123"),
    "abc123"
  );
  assert.equal(
    parsePopbillPopupTokenFromUrl("https://www.popbill.com/App/Taxinvoice/PopUp/Certificate#T=hash-token"),
    "hash-token"
  );
  assert.equal(
    parsePopbillPopupTokenFromUrl("https://www.popbill.com/App/Taxinvoice/PopUp/Certificate?token=lower-token"),
    "lower-token"
  );
  assert.equal(parsePopbillPopupTokenFromUrl("https://www.popbill.com/App/Taxinvoice/PopUp/Certificate"), null);
});

test("Popbill direct cookie helpers normalize and merge cookie headers", () => {
  assert.equal(
    buildPopbillCookieHeaderFromSetCookies([
      "PB_SESSION=first; Path=/; Secure; HttpOnly",
      "LANG=ko; Path=/; SameSite=Lax"
    ]),
    "PB_SESSION=first; LANG=ko"
  );
  assert.equal(
    mergePopbillCookieHeaders("PB_SESSION=first; LANG=ko", "PB_SESSION=second; POPUP=1"),
    "PB_SESSION=second; LANG=ko; POPUP=1"
  );
});

test("Popbill direct business number helpers normalize explicit and token response values", () => {
  assert.equal(normalizePopbillBusinessNumber("123-45-67890"), "1234567890");
  assert.equal(normalizePopbillBusinessNumber("123456789"), null);
  assert.equal(
    readPopbillBusinessNumberFromApiBody({
      result: {
        member: {
          CorpNum: "123-45-67890"
        }
      }
    }),
    "1234567890"
  );
});

test("pickPopbillDirectMagicLineCandidate prefers direct serial match", () => {
  const result = pickPopbillDirectMagicLineCandidate(
    [
      createDirectCandidate({ certificateCn: "다른발전소", serial: "SERIAL-OTHER" }),
      createDirectCandidate({ certificateCn: "한빛태양광", serial: "SERIAL-KEEP" })
    ],
    {
      certificateCn: "한빛태양광",
      serial: "SERIAL-KEEP"
    }
  );

  assert.equal(result.candidate?.serial, "SERIAL-KEEP");
  assert.equal(result.reason, "serial");
});

test("pickPopbillDirectMagicLineCandidate resolves duplicate CN with expire date", () => {
  const result = pickPopbillDirectMagicLineCandidate(
    [
      createDirectCandidate({ certificateCn: "한빛태양광", serial: "SERIAL-OLD", targetExpireDate: "2026-01-28" }),
      createDirectCandidate({ certificateCn: "한빛태양광", serial: "SERIAL-NEW", targetExpireDate: "2027-01-28" })
    ],
    {
      certificateCn: "한빛태양광",
      targetExpireDate: "2027-01-28"
    }
  );

  assert.equal(result.candidate?.serial, "SERIAL-NEW");
  assert.equal(result.reason, "CN + expire date");
});

test("pickPopbillDirectMagicLineCandidate fails closed for ambiguous duplicate CN", () => {
  const result = pickPopbillDirectMagicLineCandidate(
    [
      createDirectCandidate({ certificateCn: "한빛태양광", serial: "SERIAL-1" }),
      createDirectCandidate({ certificateCn: "한빛태양광", serial: "SERIAL-2" })
    ],
    {
      certificateCn: "한빛태양광"
    }
  );

  assert.equal(result.candidate, null);
  assert.equal(result.reason, "unique CN matched 2 candidates");
});

test("isPopbillHelperHeadlessEnabled defaults to headless and accepts explicit opt-out values", () => {
  assert.equal(isPopbillHelperHeadlessEnabled("1"), true);
  assert.equal(isPopbillHelperHeadlessEnabled("true"), true);
  assert.equal(isPopbillHelperHeadlessEnabled("yes"), true);
  assert.equal(isPopbillHelperHeadlessEnabled("on"), true);
  assert.equal(isPopbillHelperHeadlessEnabled("0"), false);
  assert.equal(isPopbillHelperHeadlessEnabled("false"), false);
  assert.equal(isPopbillHelperHeadlessEnabled("no"), false);
  assert.equal(isPopbillHelperHeadlessEnabled("off"), false);
  assert.equal(isPopbillHelperHeadlessEnabled(""), true);
  assert.equal(isPopbillHelperHeadlessEnabled(undefined), true);
});

test("resolvePopbillBrowserUserDataDir isolates headless registration sessions", async () => {
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserDataDir = process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "auto-tax-popbill-profile-test-"));
  process.env.LOCALAPPDATA = localAppData;
  delete process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;

  try {
    const first = resolvePopbillBrowserUserDataDir({ headless: true });
    const second = resolvePopbillBrowserUserDataDir({ headless: true });

    assert.equal(first.cleanupAfterClose, true);
    assert.equal(second.cleanupAfterClose, true);
    assert.notEqual(first.userDataDir, second.userDataDir);
    assert.match(first.userDataDir, /chrome-sessions[\\/]+profile-/);
    assert.match(second.userDataDir, /chrome-sessions[\\/]+profile-/);
  } finally {
    fs.rmSync(localAppData, { recursive: true, force: true });
    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }
    if (previousUserDataDir === undefined) {
      delete process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;
    } else {
      process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR = previousUserDataDir;
    }
  }
});

test("resolvePopbillBrowserUserDataDir keeps explicit or headed profiles persistent", async () => {
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const previousUserDataDir = process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;
  const configuredDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-tax-popbill-configured-profile-"));
  let headedRoot: string | null = null;
  process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR = configuredDir;

  try {
    const configured = resolvePopbillBrowserUserDataDir({ headless: true });
    assert.deepEqual(configured, {
      userDataDir: configuredDir,
      cleanupAfterClose: false
    });

    headedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auto-tax-popbill-headed-profile-"));
    delete process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;
    process.env.LOCALAPPDATA = headedRoot;
    const headed = resolvePopbillBrowserUserDataDir({ headless: false });
    assert.equal(headed.cleanupAfterClose, false);
    assert.equal(headed.userDataDir, path.join(headedRoot, "AUTO-TAX", "popbill-helper", "chrome-profile"));
  } finally {
    fs.rmSync(configuredDir, { recursive: true, force: true });
    if (headedRoot) {
      fs.rmSync(headedRoot, { recursive: true, force: true });
    }
    if (previousLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }
    if (previousUserDataDir === undefined) {
      delete process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR;
    } else {
      process.env.AUTO_TAX_POPBILL_HELPER_USER_DATA_DIR = previousUserDataDir;
    }
  }
});

test("extractRegistrationError classifies wrong password signals", () => {
  assert.equal(
    extractRegistrationError("비밀번호를 다시 입력하세요."),
    "공동인증서 비밀번호가 올바르지 않습니다."
  );
});

test("extractRegistrationError prefers business-number mismatch over stale password prompt", () => {
  assert.equal(
    extractRegistrationError(
      "비밀번호를 다시 입력하세요.\n공동인증서와 회원의 사업자번호가 일치하지 않아 등록이 불가능 합니다."
    ),
    "공동인증서와 회원의 사업자번호가 일치하지 않습니다."
  );
});

test("extractRegistrationError prefers expired certificate over generic password template text", () => {
  assert.equal(
    extractRegistrationError("비밀번호를 다시 입력하세요.\n만료된 공동인증서입니다."),
    "만료된 공동인증서입니다."
  );
});

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

test("pickPopbillCertificateCandidate resolves duplicate CN rows with a unique selected expire date", () => {
  const result = pickPopbillCertificateCandidate({
    targetExpireDate: "2027-01-28T00:00:00.000Z",
    candidates: [
      createCandidate({ selector: "body > tr:nth-of-type(1)" }),
      createCandidate({ selector: "body > tr:nth-of-type(2)" })
    ],
    selectionDetailProbes: [
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(1)",
        matchedIdentifiers: [],
        evidence: ["[class*='selected']:text:[OID_1_2_410_200004_5_2_1_6_257] signGATE CA6 2026-01-22"]
      }),
      createSelectionDetailProbe({
        selector: "body > tr:nth-of-type(2)",
        matchedIdentifiers: ["targetExpireDate"],
        evidence: ["[class*='selected']:text:[OID_1_2_410_200004_5_2_1_6_257] signGATE CA6 2027-01-28"]
      })
    ]
  });

  assert.deepEqual(result, {
    selector: "body > tr:nth-of-type(2)",
    reason: "iframe selection detail matched expire date"
  });
});

test("matchPopbillCandidateIdentifiers ignores whole-dialog active text for expire date matching", () => {
  const matchedIdentifiers = matchPopbillCandidateIdentifiers({
    targetExpireDate: "2027-01-28",
    evidenceValues: [
      "[class*='selected']:text:[OID_1_2_410_200004_5_2_1_6_257] signGATE CA6 2026-01-22",
      "active:text:다른 인증서 2026-01-22 대상 인증서 2027-01-28"
    ]
  });

  assert.deepEqual(matchedIdentifiers, []);
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
      stages: [
        "section-open-failed",
        "frame-ready-failed",
        "no-visible-cn-match",
        "ambiguous-cn-match",
        "registration-confirmation-failed"
      ]
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
      stages: [
        "section-open-failed",
        "frame-ready-failed",
        "no-visible-cn-match",
        "ambiguous-cn-match",
        "registration-confirmation-failed"
      ]
    });
  } finally {
    if (previousArtifactDir === undefined) {
      delete process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR;
    } else {
      process.env.AUTO_TAX_POPBILL_DEBUG_ARTIFACT_DIR = previousArtifactDir;
    }
  }
});
