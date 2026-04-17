import type { Customer } from "../../types";
import type {
  CustomerOnboardingCommitResponse,
  CustomerOnboardingCommitStartResponse,
  CustomerOnboardingWorkbookInput
} from "./customer-onboarding-workbook";

type ElectronicTaxOnboardingCertificateRow = CustomerOnboardingWorkbookInput["certificates"][number];

export async function waitForElectronicTaxOnboardingCommitBatch(options: {
  batchId: string;
  initial?: CustomerOnboardingCommitStartResponse;
  loadBatch: (batchId: string) => Promise<CustomerOnboardingCommitResponse>;
  onProgress: (notice: string) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CustomerOnboardingCommitResponse> {
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      }));

  if (options.initial) {
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

  for (const customer of options.pendingCustomers) {
    const onboardingCertificateRow = options.getOnboardingCertificateRow(customer);
    if (!onboardingCertificateRow) {
      failedDetails.push(`${customer.customerName}: 전자세금용 공동인증서 업로드 정보를 찾지 못했습니다.`);
      continue;
    }

    try {
      const result = await options.registerCustomer(customer, {
        onboardingCertificateRow,
        reloadAfter: false
      });
      if (result.outcome === "already-registered") {
        alreadyRegisteredNames.push(customer.customerName);
      } else {
        completedNames.push(customer.customerName);
      }
      if (result.refreshErrorMessage) {
        refreshWarnings.push(`${customer.customerName}: ${result.refreshErrorMessage}`);
      }
    } catch (error) {
      failedDetails.push(`${customer.customerName}: ${error instanceof Error ? error.message : "자동 등록 실패"}`);
    }
  }

  try {
    await options.reloadAll();
  } catch (error) {
    refreshWarnings.push(`전체 새로고침 실패: ${error instanceof Error ? error.message : "새로고침 실패"}`);
  }

  return {
    completedNames,
    alreadyRegisteredNames,
    failedDetails,
    refreshWarnings
  };
}
