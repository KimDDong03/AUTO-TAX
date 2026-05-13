import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE,
  renderIssueCompleteSmsTemplate
} from "./issueMessageTemplate";

test("renderIssueCompleteSmsTemplate replaces Korean issue placeholders", () => {
  const rendered = renderIssueCompleteSmsTemplate(DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE, {
    organizationName: "AUTO-TAX",
    customerName: "김테스트",
    plantName: "테스트태양광",
    totalAmount: "112,500"
  });

  assert.equal(rendered, "AUTO-TAX에서 테스트태양광 세금계산서 112,500원 발행이 완료되었습니다.");
});

test("renderIssueCompleteSmsTemplate leaves unknown placeholders untouched", () => {
  const rendered = renderIssueCompleteSmsTemplate("{회사명} {알수없음}", {
    organizationName: "AUTO-TAX",
    customerName: "김테스트",
    plantName: "테스트태양광",
    totalAmount: "112,500"
  });

  assert.equal(rendered, "AUTO-TAX {알수없음}");
});
