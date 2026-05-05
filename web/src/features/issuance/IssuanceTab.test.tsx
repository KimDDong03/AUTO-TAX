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

function renderIssuanceTab(options: RenderIssuanceTabOptions = {}) {
  const {
    busyKey = null,
    onSyncMail = () => {},
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
        onShowDraftPopbillInfo={() => {}}
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
    button.label.includes("메일 동기화")
  );

  assert.match(markup, /메일 동기화/);
  assert.match(markup, /세금계산서 발행 작업/);
  assert.equal(syncButton?.props?.onClick, handleSyncMail);
  assert.equal(typeof syncButton?.props?.onClick, "function");
  (syncButton?.props?.onClick as () => void)();
  assert.equal(syncClicked, true);
});

test("IssuanceTab shows mail sync progress while sync is busy", () => {
  const { markup } = renderIssuanceTab({ busyKey: "sync" });

  assert.match(markup, /동기화 중/);
});

test("IssuanceTab shows current-month customers without mail as missing mail", () => {
  const billingMonth = getCurrentSeoulBillingMonthForTest();
  const { markup } = renderIssuanceTab({
    customers: [buildCustomer()]
  });

  assert.match(markup, /메일 미수신 1/);
  assert.match(markup, /하예리/);
  assert.match(markup, new RegExp(`${billingMonth} 메일 대기`));
});

test("IssuanceTab does not show missing mail when the current month mail exists", () => {
  const { markup } = renderIssuanceTab({
    customers: [buildCustomer()],
    inboxMessages: [buildInboxMessage()]
  });

  assert.match(markup, /메일 미수신 0/);
  assert.doesNotMatch(markup, /하예리/);
});
