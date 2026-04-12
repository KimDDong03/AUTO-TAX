import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerAlerts } from "./CustomerAlerts";
import { CustomerHistorySection } from "./CustomerHistorySection";
import { CustomerListEmptyState } from "./CustomerListEmptyState";
import type { Customer, InvoiceDraft } from "../../../types";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "해성태양광",
    businessNumber: "123-45-67890",
    corpName: "해성태양광",
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

function makeDraft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    id: 10,
    customerId: 1,
    customerName: "해성태양광",
    sourceMessageId: 99,
    issueMode: "review",
    status: "issued",
    scheduledFor: null,
    issueRequestedAt: null,
    issuedAt: "2026-04-11T10:00:00.000Z",
    issueError: "",
    billingMonth: "2026-03",
    writeDate: null,
    itemName: "태양광 전력 판매",
    plantName: "해성태양광",
    supplyCost: 100000,
    taxTotal: 10000,
    totalAmount: 110000,
    kepcoCorpNum: "1234567890",
    kepcoBranchId: "001",
    kepcoCorpName: "한전",
    kepcoCeoName: "대표",
    kepcoAddr: "서울",
    kepcoBizType: "공기업",
    kepcoBizClass: "전력",
    recipientEmail: "ops@example.com",
    popbillMgtKey: "MGT-001",
    popbillEnvironment: "production",
    popbillResultJson: "{}",
    createdAt: "2026-04-11T10:00:00.000Z",
    updatedAt: "2026-04-11T10:00:00.000Z",
    ...overrides
  };
}

test("CustomerAlerts renders expired and expiring certificate notices", () => {
  const html = renderToStaticMarkup(
    <CustomerAlerts
      expiredCertCustomers={[makeCustomer({ customerName: "만료고객" })]}
      expiringSoonCustomers={[makeCustomer({ id: 2, customerName: "예정고객", popbillCertExpireDate: "2026-04-25" })]}
      formatCertificateExpireDate={(value) => value ?? "-"}
    />
  );

  assert.match(html, /인증서 만료 고객 1건/);
  assert.match(html, /만료고객/);
  assert.match(html, /인증서 만료 예정 30일 이내 1건/);
  assert.match(html, /예정고객\(2026-04-25\)/);
});

test("CustomerListEmptyState renders actions and onboarding preview", () => {
  const html = renderToStaticMarkup(
    <CustomerListEmptyState
      title="등록된 고객이 없습니다."
      description="첫 고객을 등록해 운영 목록을 채우세요."
      onPrimaryAction={() => undefined}
      primaryActionLabel="첫 고객 등록"
      onSecondaryAction={() => undefined}
      secondaryActionLabel="전체 고객 보기"
    />
  );

  assert.match(html, /등록된 고객이 없습니다\./);
  assert.match(html, /첫 고객 등록/);
  assert.match(html, /전체 고객 보기/);
  assert.match(html, /대표자·사업자번호 저장/);
  assert.match(html, /검수 후 발행/);
  assert.match(html, /즉시 발행/);
});

test("CustomerHistorySection renders loading and empty states", () => {
  const loadingHtml = renderToStaticMarkup(
    <CustomerHistorySection
      mailboxDataLoading
      drafts={[]}
      busyKey={null}
      runAction={async (_key, action) => action()}
      onShowDraftPopbillInfo={async () => undefined}
      onOpenDraftPopbillUrl={async () => undefined}
      formatDateTime={(value) => value ?? "-"}
      formatMoney={(value) => value.toLocaleString("ko-KR")}
      getDraftConfirmNumber={() => null}
    />
  );
  const emptyHtml = renderToStaticMarkup(
    <CustomerHistorySection
      mailboxDataLoading={false}
      drafts={[]}
      busyKey={null}
      runAction={async (_key, action) => action()}
      onShowDraftPopbillInfo={async () => undefined}
      onOpenDraftPopbillUrl={async () => undefined}
      formatDateTime={(value) => value ?? "-"}
      formatMoney={(value) => value.toLocaleString("ko-KR")}
      getDraftConfirmNumber={() => null}
    />
  );

  assert.match(loadingHtml, /발행 이력을 불러오는 중입니다\./);
  assert.match(emptyHtml, /이 고객의 발행 이력이 없습니다\./);
});

test("CustomerHistorySection renders issued draft rows", () => {
  const html = renderToStaticMarkup(
    <CustomerHistorySection
      mailboxDataLoading={false}
      drafts={[makeDraft()]}
      busyKey={null}
      runAction={async (_key, action) => action()}
      onShowDraftPopbillInfo={async () => undefined}
      onOpenDraftPopbillUrl={async () => undefined}
      formatDateTime={(value) => value ?? "-"}
      formatMoney={(value) => value.toLocaleString("ko-KR")}
      getDraftConfirmNumber={() => "APPROVED-001"}
    />
  );

  assert.match(html, /태양광 전력 판매/);
  assert.match(html, /발행 완료/);
  assert.match(html, /공급가액 100,000원/);
  assert.match(html, /승인번호 APPROVED-001/);
  assert.match(html, /상태조회/);
  assert.match(html, /보기/);
  assert.match(html, /인쇄/);
});
