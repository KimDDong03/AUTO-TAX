import test from "node:test";
import assert from "node:assert/strict";
import { buildElectronicTaxRegistrationFollowupNotice } from "./electronic-tax-onboarding-formatters";

test("buildElectronicTaxRegistrationFollowupNotice reports customers skipped before Popbill join", () => {
  const notice = buildElectronicTaxRegistrationFollowupNotice({
    completedNames: ["김성공"],
    alreadyRegisteredNames: [],
    failedDetails: [],
    refreshWarnings: [],
    skippedBeforeJoinCount: 2
  });

  assert.match(notice, /자동 등록 1건/);
  assert.match(notice, /가입 전 제외 2건/);
  assert.match(notice, /팝빌 가입이 끝나지 않은 2건은 전자세금용 인증서 등록을 시도하지 않았습니다/);
});
