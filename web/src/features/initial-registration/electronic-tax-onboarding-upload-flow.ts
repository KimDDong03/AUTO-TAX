import { buildElectronicTaxOnboardingPreviewNotice } from "./electronic-tax-onboarding-formatters";
import type {
  CustomerOnboardingPreviewResponse,
  CustomerOnboardingTemplateWorkbookInput,
  CustomerOnboardingWorkbookInput
} from "./customer-onboarding-workbook";
import type { CustomerOnboardingResolutionResult } from "./electronic-tax-onboarding-resolver";

export type ElectronicTaxOnboardingSessionState = {
  templateDownloaded: boolean;
  previewReady: boolean;
  commitDone: boolean;
  certificateDone: boolean;
  targetBusinessNumbers: string[];
};

export const emptyElectronicTaxOnboardingSessionState: ElectronicTaxOnboardingSessionState = {
  templateDownloaded: false,
  previewReady: false,
  commitDone: false,
  certificateDone: false,
  targetBusinessNumbers: []
};

type ParsedCustomerOnboardingWorkbook = {
  fileName: string;
  warnings: string[];
  workbook: CustomerOnboardingTemplateWorkbookInput;
};

export type ElectronicTaxOnboardingUploadFlowResult = {
  fileName: string;
  workbook: CustomerOnboardingWorkbookInput | null;
  preview: CustomerOnboardingPreviewResponse | null;
  sessionState: ElectronicTaxOnboardingSessionState;
  passwordFailureEntries: Array<{
    key: string;
    label: string;
  }>;
  notice: string;
  error: string;
};

function joinElectronicTaxOnboardingMessages(messages: string[]): string {
  return messages.filter((message) => message.trim() !== "").join("\n");
}

function getElectronicTaxOnboardingTargetBusinessNumbers(
  workbook: CustomerOnboardingWorkbookInput
): string[] {
  return [...new Set(
    workbook.certificates
      .filter((certificate) => certificate.certificateKind === "electronic_tax")
      .map((certificate) => String(certificate.businessNumber ?? "").replace(/\D/g, ""))
      .filter((businessNumber) => businessNumber.length > 0)
  )];
}

function getImportablePreviewBusinessNumbers(
  preview: CustomerOnboardingPreviewResponse,
  fallbackBusinessNumbers: string[]
): string[] {
  const businessNumbers = [...new Set(
    preview.rows
      .filter((row) => row.canImport)
      .map((row) => String(row.businessNumber ?? "").replace(/\D/g, ""))
      .filter((businessNumber) => businessNumber.length > 0)
  )];
  return businessNumbers.length > 0 ? businessNumbers : fallbackBusinessNumbers;
}

function buildElectronicTaxOnboardingUploadClearedResult(
  previousSessionState: ElectronicTaxOnboardingSessionState
): ElectronicTaxOnboardingUploadFlowResult {
  return {
    fileName: "",
    workbook: null,
    preview: null,
    sessionState: {
      ...previousSessionState,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers: []
    },
    passwordFailureEntries: [],
    notice: "",
    error: ""
  };
}

function buildElectronicTaxOnboardingUploadFailureResult(
  previousSessionState: ElectronicTaxOnboardingSessionState,
  error: unknown
): ElectronicTaxOnboardingUploadFlowResult {
  return {
    fileName: "",
    workbook: null,
    preview: null,
    sessionState: {
      ...previousSessionState,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers: []
    },
    passwordFailureEntries: [],
    notice: "",
    error: error instanceof Error ? error.message : "엑셀 양식을 읽지 못했습니다."
  };
}

export async function runElectronicTaxOnboardingUploadFlow<TFile>(options: {
  file: TFile | null;
  previousSessionState: ElectronicTaxOnboardingSessionState;
  parseWorkbook: (file: TFile) => Promise<ParsedCustomerOnboardingWorkbook>;
  resolveWorkbook: (
    templateWorkbook: CustomerOnboardingTemplateWorkbookInput
  ) => Promise<CustomerOnboardingResolutionResult>;
  previewWorkbook: (workbook: CustomerOnboardingWorkbookInput) => Promise<CustomerOnboardingPreviewResponse>;
  onProgress?: (message: string) => void;
}): Promise<ElectronicTaxOnboardingUploadFlowResult> {
  if (!options.file) {
    return buildElectronicTaxOnboardingUploadClearedResult(options.previousSessionState);
  }

  try {
    options.onProgress?.("양식 확인 중...");
    const parsed = await options.parseWorkbook(options.file);
    options.onProgress?.("인증서 확인 중...");
    const resolved = await options.resolveWorkbook(parsed.workbook);
    const workbookMessages = joinElectronicTaxOnboardingMessages([...parsed.warnings, ...resolved.errors]);
    const targetBusinessNumbers = getElectronicTaxOnboardingTargetBusinessNumbers(resolved.workbook);
    const baseSessionState: ElectronicTaxOnboardingSessionState = {
      templateDownloaded: true,
      previewReady: false,
      commitDone: false,
      certificateDone: false,
      targetBusinessNumbers
    };

    if (resolved.workbook.customers.length === 0) {
      return {
        fileName: parsed.fileName,
        workbook: resolved.workbook,
        preview: null,
        sessionState: baseSessionState,
        passwordFailureEntries: resolved.passwordFailureEntries,
        notice: "등록 대상 행이 없습니다.",
        error: workbookMessages
      };
    }

    options.onProgress?.(`고객 ${resolved.workbook.customers.length}건 검토 중...`);
    const preview = await options.previewWorkbook(resolved.workbook);
    return {
      fileName: parsed.fileName,
      workbook: resolved.workbook,
      preview,
      sessionState: {
        ...baseSessionState,
        previewReady: true,
        targetBusinessNumbers: getImportablePreviewBusinessNumbers(preview, targetBusinessNumbers)
      },
      passwordFailureEntries: resolved.passwordFailureEntries,
      notice: buildElectronicTaxOnboardingPreviewNotice({
        resolvedCertificateCount: resolved.resolvedCertificateCount,
        customerCount: resolved.workbook.customers.length,
        acceptedBeforeWindowCount: resolved.acceptedBeforeWindowCount,
        skippedCertificateCount: resolved.skippedCertificateCount,
        workbookWarnings: parsed.warnings
      }),
      error: workbookMessages
    };
  } catch (error) {
    return buildElectronicTaxOnboardingUploadFailureResult(options.previousSessionState, error);
  }
}
