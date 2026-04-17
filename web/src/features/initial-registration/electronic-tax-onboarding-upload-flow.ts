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
};

export const emptyElectronicTaxOnboardingSessionState: ElectronicTaxOnboardingSessionState = {
  templateDownloaded: false,
  previewReady: false,
  commitDone: false
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
  notice: string;
  error: string;
};

function joinElectronicTaxOnboardingMessages(messages: string[]): string {
  return messages.filter((message) => message.trim() !== "").join("\n");
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
      commitDone: false
    },
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
      commitDone: false
    },
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
}): Promise<ElectronicTaxOnboardingUploadFlowResult> {
  if (!options.file) {
    return buildElectronicTaxOnboardingUploadClearedResult(options.previousSessionState);
  }

  try {
    const parsed = await options.parseWorkbook(options.file);
    const resolved = await options.resolveWorkbook(parsed.workbook);
    const workbookMessages = joinElectronicTaxOnboardingMessages([...parsed.warnings, ...resolved.errors]);
    const baseSessionState: ElectronicTaxOnboardingSessionState = {
      templateDownloaded: true,
      previewReady: false,
      commitDone: false
    };

    if (resolved.workbook.customers.length === 0) {
      return {
        fileName: parsed.fileName,
        workbook: resolved.workbook,
        preview: null,
        sessionState: baseSessionState,
        notice: `${parsed.fileName}에서 발전소 시트에 남긴 전자세금용 등록 대상 행을 찾지 못했습니다.`,
        error: workbookMessages
      };
    }

    const preview = await options.previewWorkbook(resolved.workbook);
    return {
      fileName: parsed.fileName,
      workbook: resolved.workbook,
      preview,
      sessionState: {
        ...baseSessionState,
        previewReady: true
      },
      notice: `${parsed.fileName} 업로드 확인을 마쳤습니다. ${buildElectronicTaxOnboardingPreviewNotice({
        resolvedCertificateCount: resolved.resolvedCertificateCount,
        customerCount: resolved.workbook.customers.length,
        acceptedBeforeWindowCount: resolved.acceptedBeforeWindowCount,
        skippedCertificateCount: resolved.skippedCertificateCount,
        workbookWarnings: parsed.warnings
      })}`,
      error: workbookMessages
    };
  } catch (error) {
    return buildElectronicTaxOnboardingUploadFailureResult(options.previousSessionState, error);
  }
}
