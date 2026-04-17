import test from "node:test";
import assert from "node:assert/strict";
import {
  getPopbillDebugArtifactSupport,
  matchPopbillCandidateIdentifiers,
  pickPopbillCertificateCandidate,
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
