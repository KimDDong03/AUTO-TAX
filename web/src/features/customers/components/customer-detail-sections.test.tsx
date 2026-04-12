import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerDetailOverview } from "./CustomerDetailOverview";
import { CustomerReadSection } from "./CustomerReadSection";
import type { Customer } from "../../../types";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "해성태양광",
    businessNumber: "123-45-67890",
    corpName: "해성태양광 주식회사",
    ceoName: "홍길동",
    addr: "서울특별시 중구 세종대로 1",
    bizType: "서비스",
    bizClass: "태양광",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: true,
    popbillCertExpireDate: "2026-05-01",
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "01012345678",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    ...overrides
  };
}

test("CustomerDetailOverview renders customer status summary and issue actions", () => {
  const html = renderToStaticMarkup(
    <CustomerDetailOverview
      customer={makeCustomer()}
      readiness={{
        label: "발행 불가",
        tone: "danger",
        reason: "인증서 등록 필요",
        actionLabel: "인증서 등록",
        onAction: () => undefined
      }}
      statusCards={[
        { label: "발행 준비상태", value: "발행 불가", note: "인증서 등록 필요", tone: "danger" },
        { label: "팝빌 상태", value: "가입 완료", note: "고객 계정 연결 완료", tone: "success" }
      ]}
      issues={[
        { key: "cert", label: "전자세금용 인증서 미등록", tone: "danger", actionLabel: "등록하기", onAction: () => undefined }
      ]}
      heroActions={<button type="button">팝빌 가입</button>}
      secondaryActions={<button type="button">고객 삭제</button>}
      certificateNotice="인증서 만료일을 다시 확인하세요."
    />
  );

  assert.match(html, /해성태양광 주식회사/);
  assert.match(html, /발행 불가/);
  assert.match(html, /인증서 등록 필요/);
  assert.match(html, /전자세금용 인증서 미등록/);
  assert.match(html, /등록하기/);
  assert.match(html, /인증서 상태 안내/);
  assert.match(html, /고객 삭제/);
});

test("CustomerReadSection renders fields and toggle label", () => {
  const html = renderToStaticMarkup(
    <CustomerReadSection
      title="기본 정보"
      description="평소에는 읽기 화면으로 보고, 필요할 때만 수정합니다."
      isEditing={false}
      openLabel="기본 정보 수정"
      closeLabel="수정 닫기"
      onToggle={() => undefined}
      fields={[
        { label: "대표자명", value: "홍길동", full: false },
        { label: "주소", value: "서울특별시 중구 세종대로 1", full: true }
      ]}
    >
      <div>편집 폼 자리</div>
    </CustomerReadSection>
  );

  assert.match(html, /기본 정보/);
  assert.match(html, /기본 정보 수정/);
  assert.match(html, /대표자명/);
  assert.match(html, /홍길동/);
  assert.match(html, /주소/);
  assert.match(html, /편집 폼 자리/);
});
