import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IssuanceTab } from "./IssuanceTab";
import type { Customer, InboxMessage, InvoiceDraft } from "../../types";

type CapturedButton = {
  label: string;
  props: Record<string, unknown> | null;
};

function collectNodeText(nodes: React.ReactNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string" || typeof node === "number") {
        return String(node);
      }
      if (Array.isArray(node)) {
        return collectNodeText(node);
      }
      if (React.isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode };
        return collectNodeText([props.children]);
      }
      return "";
    })
    .join("");
}

type RenderIssuanceTabOptions = {
  busyKey?: string | null;
  onSyncMail?: () => void;
  requestedFilter?: "pending" | "scheduled" | "issuing" | "issued" | "unmatched" | "missingMail" | "all" | null;
  drafts?: InvoiceDraft[];
  inboxMessages?: InboxMessage[];
  unmatchedInboxMessages?: InboxMessage[];
  customers?: Customer[];
};

function getCurrentSeoulBillingMonthForTest(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 410,
    customerName: "하예리",
    businessNumber: "4490303746",
    corpName: "하예리발전소",
    ceoName: "하예리",
    addr: "제주특별자치도 서귀포시",
    bizType: "전기업",
    bizClass: "태양광발전",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: true,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    memo: "",
    plantNames: ["하예리발전소"],
    matchAddresses: [],
    ...overrides
  };
}

function buildInboxMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 89,
    subject: "신재생에너지 요금안내",
    fromAddress: "kepco@example.test",
    receivedAt: new Date().toISOString(),
    parseStatus: "parsed",
    parseError: "",
    customerId: 410,
    draftId: null,
    parsedData: {
      plantName: "하예리발전소",
      plantAddress: "제주특별자치도 서귀포시",
      billingMonth: getCurrentSeoulBillingMonthForTest(),
      supplyCost: 184000,
      taxTotal: 18400,
      itemName: "전력",
      kepcoBranchId: "0201"
    },
    ...overrides
  };
}

function buildDraft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    id: 501,
    customerId: 410,
    customerName: "하예리",
    sourceMessageId: 89,
    issueMode: "review",
    status: "review",
    scheduledFor: null,
    issueRequestedAt: null,
    issuedAt: null,
    issueError: "",
    billingMonth: "2026-04",
    writeDate: null,
    itemName: "전력 판매",
    plantName: "하예리발전소",
    supplyCost: 121867,
    taxTotal: 12186,
    totalAmount: 134053,
    kepcoCorpNum: "120-82-00052",
    kepcoBranchId: "",
    kepcoCorpName: "하예리",
    kepcoCeoName: "하예리",
    kepcoAddr: "충청남도 아산시",
    kepcoBizType: "전기업",
    kepcoBizClass: "태양광발전",
    recipientEmail: "kepco-mail@example.com",
    popbillMgtKey: "mgt-501",
    popbillEnvironment: null,
    popbillResultJson: "",
    createdAt: "2026-04-29T07:04:00.000Z",
    updatedAt: "2026-04-29T07:04:00.000Z",
    ...overrides
  };
}

function renderIssuanceTab(options: RenderIssuanceTabOptions = {}) {
  const {
    busyKey = null,
    onSyncMail = () => {},
    requestedFilter = null,
    drafts = [],
    inboxMessages = [],
    unmatchedInboxMessages = [],
    customers = []
  } = options;
  const buttons: CapturedButton[] = [];
  const reactModule = React as unknown as {
    createElement: typeof React.createElement;
  };
  const originalCreateElement = reactModule.createElement;

  reactModule.createElement = ((
    type: string | React.JSXElementConstructor<unknown>,
    props: Record<string, unknown> | null,
    ...children: React.ReactNode[]
  ) => {
    if (type === "button") {
      buttons.push({
        label: collectNodeText(children),
        props: props ?? null
      });
    }

    return originalCreateElement(
      type as never,
      props as never,
      ...(children as never[])
    );
  }) as typeof React.createElement;

  try {
    const markup = renderToStaticMarkup(
      <IssuanceTab
        mailboxDataLoading={false}
        screenTitle="세금계산서 발행"
        userLabel="테스트 사용자"
        workspaceLabel="테스트 작업공간"
        popbillModeLabel="테스트"
        operatorContactName="운영자"
        operatorContactTel="010-1111-2222"
        operatorContactEmail="operator@example.com"
        requestedFilter={requestedFilter}
        onConsumeRequestedFilter={() => {}}
        drafts={drafts}
        inboxMessages={inboxMessages}
        unmatchedInboxMessages={unmatchedInboxMessages}
        customers={customers}
        busyKey={busyKey}
        onSyncMail={onSyncMail}
        loadDraftMailPreview={async () => ({
          imageDataUrl: "",
          width: 0,
          height: 0,
          sourceMessageId: 0,
          generatedFrom: "raw-source-text",
          cropKind: "body-fallback"
        })}
        onIssueAllReviewDrafts={() => {}}
        onIssueSelectedDrafts={() => {}}
        onIssueDraft={() => {}}
        onReprocessInboxMessage={() => {}}
        onViewDraft={() => {}}
        onPrintDraft={() => {}}
        onCancelDraft={() => {}}
        onUpdateDraftTaxInvoiceInfo={async () => {}}
        formatMoney={(value) => String(value)}
        formatDateTime={(value) => value ?? "-"}
        getDraftStatusLabel={(status) => status}
        getDraftConfirmNumber={() => null}
        simplifyIssueError={(value) => value}
      />
    );

    return { buttons, markup };
  } finally {
    reactModule.createElement = originalCreateElement;
  }
}

test("IssuanceTab exposes manual mail sync from the issuance toolbar", () => {
  let syncClicked = false;
  const handleSyncMail = () => {
    syncClicked = true;
  };
  const { buttons, markup } = renderIssuanceTab({ onSyncMail: handleSyncMail });
  const syncButton = buttons.find((button) =>
    button.label.includes("메일 다시 가져오기")
  );

  assert.match(markup, /메일 다시 가져오기/);
  assert.match(markup, /세금계산서 발행 작업/);
  assert.equal(syncButton?.props?.onClick, handleSyncMail);
  assert.equal(typeof syncButton?.props?.onClick, "function");
  (syncButton?.props?.onClick as () => void)();
  assert.equal(syncClicked, true);
});

test("IssuanceTab shows mail sync progress while sync is busy", () => {
  const { markup } = renderIssuanceTab({ busyKey: "sync" });

  assert.match(markup, /가져오는 중/);
});

test("IssuanceTab labels the draft edit action as tax invoice info editing", () => {
  const { buttons, markup } = renderIssuanceTab({
    drafts: [buildDraft()],
    customers: [buildCustomer()]
  });

  assert.match(markup, /자동 등록된 세금계산서 정보/);
  assert.match(markup, /공급자/);
  assert.match(markup, /공급받는자/);
  assert.match(markup, /발행 내용/);
  assert.match(markup, /등록번호/);
  assert.match(markup, /종사업장번호/);
  assert.match(markup, /수신 이메일/);
  assert.match(markup, /하예리발전소/);
  assert.match(markup, /4490303746/);
  assert.match(markup, /제주특별자치도 서귀포시/);
  assert.match(markup, /operator@example\.com/);
  assert.match(markup, /품목/);
  assert.match(markup, /비고\/발전소명/);
  assert.match(markup, /공급가액/);
  assert.match(markup, /부가세/);
  assert.match(markup, /합계금액/);
  assert.doesNotMatch(markup, /문서번호/);
  assert.doesNotMatch(markup, /상세 구매일자/);
  assert.ok(buttons.some((button) => button.label.includes("세금계산서 정보 수정")));
});

test("IssuanceTab shows current-month customers without mail as missing mail", () => {
  const billingMonth = getCurrentSeoulBillingMonthForTest();
  const { markup } = renderIssuanceTab({
    requestedFilter: "missingMail",
    customers: [buildCustomer()]
  });

  assert.match(markup, /issuance-filter-label">메일 미수신<\/span><span class="issuance-filter-count">1<\/span>/);
  assert.match(markup, /하예리/);
  assert.match(markup, new RegExp(`${billingMonth} 메일 대기`));
});

test("IssuanceTab does not show missing mail when the current month mail exists", () => {
  const { markup } = renderIssuanceTab({
    requestedFilter: "missingMail",
    customers: [buildCustomer()],
    inboxMessages: [buildInboxMessage()]
  });

  assert.match(markup, /issuance-filter-label">메일 미수신<\/span><span class="issuance-filter-count">0<\/span>/);
  assert.doesNotMatch(markup, /하예리/);
});
