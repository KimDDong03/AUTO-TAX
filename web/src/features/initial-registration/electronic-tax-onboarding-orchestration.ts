import type { Customer } from "../../types";
import type {
  CustomerOnboardingCommitResponse,
  CustomerOnboardingCommitStartResponse,
  CustomerOnboardingWorkbookInput
} from "./customer-onboarding-workbook";

type ElectronicTaxOnboardingCertificateRow = CustomerOnboardingWorkbookInput["certificates"][number];

export type ElectronicTaxOnboardingCertificateRegistrationProgress = {
  total: number;
  current: number;
  completed: number;
  alreadyRegistered: number;
  failed: number;
  currentCustomerName: string;
  status: "running" | "success" | "already-registered" | "failed" | "skipped" | "refreshing";
};

function sanitizeElectronicTaxRegistrationMessage(value: string): string {
  if (value.includes("공동인증서 비밀번호가 올바르지 않습니다") || value.includes("비밀번호가 올바르지")) {
    return "사전조회 때 확인한 비밀번호로 등록했지만 등록 화면에서 인증서 확인에 실패했습니다. AT 헬퍼에서 공동인증서를 다시 읽고 재시도하세요.";
  }

  if (value.includes("같은 인증서명(CN)") || value.includes("ambiguous-cn-match")) {
    return "같은 이름의 전자세금용 공동인증서가 여러 개라 자동으로 하나를 고르지 못했습니다.";
  }

  if (
    value.includes("Target.createTarget") ||
    value.includes("Failed to open a new tab") ||
    value.includes("Target page, context or browser has been closed") ||
    value.includes("browser has been closed") ||
    value.includes("page has been closed")
  ) {
    return "자동등록 브라우저 연결이 끊겼습니다. 잠시 후 다시 시도하세요. 반복되면 AT 헬퍼와 Chrome을 다시 실행하세요.";
  }

  return value
    .replace(/팝빌\s*전자세금용\s*공동인증서/g, "전자세금용 공동인증서")
    .replace(/팝빌\s*전자세금용\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*등록/g, "전자세금용 등록")
    .replace(/팝빌/g, "등록 처리")
    .replace(/Popbill|POPBILL/g, "등록 처리");
}

function getElectronicTaxRegistrationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error
    ? sanitizeElectronicTaxRegistrationMessage(error.message)
    : fallback;
}

export async function waitForElectronicTaxOnboardingCommitBatch(options: {
  batchId: string;
  initial?: CustomerOnboardingCommitStartResponse;
  loadBatch: (batchId: string) => Promise<CustomerOnboardingCommitResponse>;
  kickRunner?: () => Promise<void>;
  onProgress: (notice: string) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CustomerOnboardingCommitResponse> {
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      }));
  let runnerPromise: Promise<void> | null = null;
  const kickRunner = () => {
    if (!options.kickRunner || runnerPromise) {
      return;
    }
    runnerPromise = options.kickRunner().finally(() => {
      runnerPromise = null;
    });
    void runnerPromise.catch(() => {
      // The batch status poll below is the source of truth for visible errors.
    });
  };

  if (options.initial) {
    if (options.initial.status === "queued" || options.initial.status === "running") {
      kickRunner();
    }
    options.onProgress(`고객 반영을 시작했습니다. ${options.initial.completedRows}/${options.initial.totalRows}건 처리됨`);
  }

  while (true) {
    const batch = await options.loadBatch(options.batchId);

    if (batch.status === "completed") {
      return batch;
    }

    if (batch.status === "failed") {
      throw new Error(batch.error ?? "고객 반영 배치가 실패했습니다.");
    }

    options.onProgress(`고객 반영 진행 중... ${batch.completedRows}/${batch.totalRows}건 처리됨`);
    kickRunner();
    await sleep(1000);
  }
}

export async function processElectronicTaxOnboardingCertificateRegistrations(options: {
  pendingCustomers: Customer[];
  getOnboardingCertificateRow: (customer: Customer) => ElectronicTaxOnboardingCertificateRow | null;
  registerCustomer: (
    customer: Customer,
    registrationOptions: {
      onboardingCertificateRow: ElectronicTaxOnboardingCertificateRow;
      reloadAfter?: boolean;
    }
  ) => Promise<{
    outcome: "registered" | "already-registered";
    refreshErrorMessage: string;
  }>;
  reloadAll: () => Promise<void>;
  onProgress?: (progress: ElectronicTaxOnboardingCertificateRegistrationProgress) => void;
}): Promise<{
  completedNames: string[];
  alreadyRegisteredNames: string[];
  failedDetails: string[];
  refreshWarnings: string[];
}> {
  const completedNames: string[] = [];
  const alreadyRegisteredNames: string[] = [];
  const failedDetails: string[] = [];
  const refreshWarnings: string[] = [];
  const total = options.pendingCustomers.length;

  const emitProgress = (
    customer: Customer,
    index: number,
    status: ElectronicTaxOnboardingCertificateRegistrationProgress["status"]
  ) => {
    options.onProgress?.({
      total,
      current: Math.min(index + 1, total),
      completed: completedNames.length,
      alreadyRegistered: alreadyRegisteredNames.length,
      failed: failedDetails.length,
      currentCustomerName: customer.customerName,
      status
    });
  };

  for (let index = 0; index < options.pendingCustomers.length; index += 1) {
    const customer = options.pendingCustomers[index]!;
    emitProgress(customer, index, "running");
    const onboardingCertificateRow = options.getOnboardingCertificateRow(customer);
    if (!onboardingCertificateRow) {
      failedDetails.push(`${customer.customerName}: 전자세금용 공동인증서 업로드 정보를 찾지 못했습니다.`);
      emitProgress(customer, index, "skipped");
      continue;
    }

    try {
      const result = await options.registerCustomer(customer, {
        onboardingCertificateRow,
        reloadAfter: false
      });
      if (result.outcome === "already-registered") {
        alreadyRegisteredNames.push(customer.customerName);
        emitProgress(customer, index, "already-registered");
      } else {
        completedNames.push(customer.customerName);
        emitProgress(customer, index, "success");
      }
      if (result.refreshErrorMessage) {
        refreshWarnings.push(`${customer.customerName}: ${result.refreshErrorMessage}`);
      }
    } catch (error) {
      failedDetails.push(`${customer.customerName}: ${getElectronicTaxRegistrationErrorMessage(error, "자동 등록 실패")}`);
      emitProgress(customer, index, "failed");
    }
  }

  try {
    if (total > 0) {
      options.onProgress?.({
        total,
        current: total,
        completed: completedNames.length,
        alreadyRegistered: alreadyRegisteredNames.length,
        failed: failedDetails.length,
        currentCustomerName: "",
        status: "refreshing"
      });
    }
    await options.reloadAll();
  } catch (error) {
    refreshWarnings.push(`전체 새로고침 실패: ${getElectronicTaxRegistrationErrorMessage(error, "새로고침 실패")}`);
  }

  return {
    completedNames,
    alreadyRegisteredNames,
    failedDetails,
    refreshWarnings
  };
}
