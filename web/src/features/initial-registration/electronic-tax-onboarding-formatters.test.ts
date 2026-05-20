import test from "node:test";
import assert from "node:assert/strict";
import { buildElectronicTaxRegistrationFollowupNotice } from "./electronic-tax-onboarding-formatters";

test("buildElectronicTaxRegistrationFollowupNotice reports customers skipped before issuing integration readiness", () => {
  const notice = buildElectronicTaxRegistrationFollowupNotice({
    completedNames: ["김성공"],
    alreadyRegisteredNames: [],
    failedDetails: [],
    refreshWarnings: [],
    skippedBeforeJoinCount: 2
  });

  assert.match(notice, /자동 등록 1건/);
  assert.match(notice, /가입 전 제외 2건/);
  assert.match(notice, /발행 준비 전 2건/);
  assert.doesNotMatch(notice, /팝빌|Popbill|POPBILL/);
});
