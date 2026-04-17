import test from "node:test";
import assert from "node:assert/strict";
import type { Customer } from "../../types";
import type { CustomerOnboardingCommitResponse } from "./customer-onboarding-workbook";
import {
  processElectronicTaxOnboardingCertificateRegistrations,
  waitForElectronicTaxOnboardingCommitBatch
} from "./electronic-tax-onboarding-orchestration";

function createCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    customerName: "한빛태양광",
    businessNumber: "123-45-67890",
    corpName: "한빛태양광",
    ceoName: "홍길동",
    addr: "서울시 강남구",
    bizType: "서비스",
    bizClass: "태양광",
    popbillUserId: "",
    popbillPassword: "",
    popbillState: "joined",
    popbillCertRegistered: false,
    popbillCertExpireDate: null,
    issueMode: "review",
    issueDay: null,
    issueHour: null,
    issueMinute: null,
    renewalContactMobile: "",
    memo: "",
    plantNames: [],
    matchAddresses: [],
    ...overrides
  };
}

test("waitForElectronicTaxOnboardingCommitBatch polls until completion and reports progress", async () => {
  const notices: string[] = [];
  const statuses: CustomerOnboardingCommitResponse[] = [
    {
      batchId: "batch-1",
      previewId: "preview-1",
      status: "running",
      totalCustomers: 2,
      totalRows: 2,
      completedRows: 1,
      createdCount: 0,
      updatedCount: 0,
      successCount: 1,
      failedCount: 0,
      linkedCertificateCount: 1,
      warnings: [],
      failedRows: [],
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-17T00:00:01.000Z"
    },
    {
      batchId: "batch-1",
      previewId: "preview-1",
      status: "completed",
      totalCustomers: 2,
      totalRows: 2,
      completedRows: 2,
      createdCount: 1,
      updatedCount: 1,
      successCount: 2,
      failedCount: 0,
      linkedCertificateCount: 2,
      warnings: [],
      failedRows: [],
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-17T00:00:02.000Z"
    }
  ];
  let callCount = 0;

  const result = await waitForElectronicTaxOnboardingCommitBatch({
    batchId: "batch-1",
    initial: {
      batchId: "batch-1",
      previewId: "preview-1",
      status: "running",
      totalRows: 2,
      completedRows: 0,
      successCount: 0,
      failedCount: 0,
      createdAt: "2026-04-17T00:00:00.000Z"
    },
    loadBatch: async () => statuses[callCount++]!,
    onProgress: (notice) => notices.push(notice),
    sleep: async () => undefined
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(notices, [
    "고객 반영을 시작했습니다. 0/2건 처리됨",
    "고객 반영 진행 중... 1/2건 처리됨"
  ]);
});

test("processElectronicTaxOnboardingCertificateRegistrations aggregates follow-up results", async () => {
  const customers = [
    createCustomer({ id: 1, customerName: "성공 고객" }),
    createCustomer({ id: 2, customerName: "기등록 고객" }),
    createCustomer({ id: 3, customerName: "행 없음 고객" }),
    createCustomer({ id: 4, customerName: "실패 고객" })
  ];

  const result = await processElectronicTaxOnboardingCertificateRegistrations({
    pendingCustomers: customers,
    getOnboardingCertificateRow: (customer) =>
      customer.id === 3
        ? null
        : {
            rowIndex: customer.id,
            businessNumber: `123-45-6789${customer.id}`,
            certificateKind: "electronic_tax",
            certificateIndex: String(customer.id),
            certificateName: customer.customerName,
            certificateUsageName: "전자세금용",
            issuerName: "issuer",
            serial: `SERIAL-${customer.id}`,
            userDN: `USER-DN-${customer.id}`,
            certificatePassword: "pw",
            isPrimary: true
          },
    registerCustomer: async (customer) => {
      if (customer.id === 1) {
        return { outcome: "registered" as const, refreshErrorMessage: "" };
      }
      if (customer.id === 2) {
        return { outcome: "already-registered" as const, refreshErrorMessage: "상태 재확인 실패" };
      }
      throw new Error("자동 등록 실패");
    },
    reloadAll: async () => undefined
  });

  assert.deepEqual(result, {
    completedNames: ["성공 고객"],
    alreadyRegisteredNames: ["기등록 고객"],
    failedDetails: [
      "행 없음 고객: 전자세금용 공동인증서 업로드 정보를 찾지 못했습니다.",
      "실패 고객: 자동 등록 실패"
    ],
    refreshWarnings: ["기등록 고객: 상태 재확인 실패"]
  });
});
