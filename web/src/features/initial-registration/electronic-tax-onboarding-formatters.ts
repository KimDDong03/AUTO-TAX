import type { CustomerOnboardingCommitResponse } from "./customer-onboarding-workbook";

export function buildElectronicTaxOnboardingTemplateNotice(options: {
  certificateCount: number;
  unregisteredCustomerCount?: number;
}): string {
  return `만료되지 않은 전자세금용 공동인증서 ${options.certificateCount}건으로 양식을 만들었습니다. 등록할 행만 남기고 발전소명을 입력해 주세요.`;
}

export function buildElectronicTaxOnboardingPreviewNotice(options: {
  resolvedCertificateCount: number;
  customerCount: number;
  acceptedBeforeWindowCount: number;
  skippedCertificateCount: number;
  workbookWarnings: string[];
}): string {
  const noticeParts = [
    `등록 대상 ${options.customerCount}건을 확인했습니다.`,
    `확인된 전자세금용 인증서 ${options.resolvedCertificateCount}건`
  ];

  if (options.acceptedBeforeWindowCount > 0) {
    noticeParts.push(
      `기간 전 확인 ${options.acceptedBeforeWindowCount}건 포함`
    );
  }
  if (options.skippedCertificateCount > 0) {
    noticeParts.push(
      `제외 ${options.skippedCertificateCount}건은 아래 메시지를 확인하세요.`
    );
  }
  if (options.workbookWarnings.length > 0) {
    noticeParts.push(options.workbookWarnings.join(" "));
  }

  return noticeParts.join(" ");
}

export function buildElectronicTaxOnboardingCommitNotice(
  result: Pick<CustomerOnboardingCommitResponse, "createdCount" | "updatedCount" | "linkedCertificateCount" | "warnings">
): string {
  const summary = `고객 반영 완료 · 신규 ${result.createdCount}건 / 갱신 ${result.updatedCount}건 / 인증서 ${result.linkedCertificateCount}건`;
  const warningSummary =
    result.warnings.length > 0 ? `\n확인 필요 ${result.warnings.length}건` : "";
  return `${summary}${warningSummary}`;
}

function summarizeElectronicTaxRegistrationFailure(detail: string): string {
  const separatorIndex = detail.indexOf(":");
  const customerName = separatorIndex >= 0 ? detail.slice(0, separatorIndex).trim() : "";
  const rawMessage = separatorIndex >= 0 ? detail.slice(separatorIndex + 1).trim() : detail.trim();
  const normalizedMessage = rawMessage
    .replace(/\s+/g, " ")
    .replace(/팝빌\s*전자세금용\s*공동인증서/g, "전자세금용 공동인증서")
    .replace(/팝빌\s*전자세금용\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*등록/g, "전자세금용 등록")
    .replace(/팝빌/g, "등록 처리")
    .replace(/Popbill|POPBILL/g, "등록 처리");

  let simplifiedMessage = normalizedMessage;
  if (normalizedMessage.includes("공동인증서 비밀번호가 올바르지 않습니다")) {
    simplifiedMessage = "공동인증서 비밀번호가 올바르지 않습니다.";
  } else if (
    normalizedMessage.includes("locator.fill: Timeout") &&
    normalizedMessage.includes("#input_cert_pw")
  ) {
    simplifiedMessage = "비밀번호 입력창이 활성화되지 않아 자동 등록을 중단했습니다.";
  } else if (normalizedMessage.includes("page.waitForResponse: Timeout")) {
    simplifiedMessage = "전자세금용 등록 확인 응답을 기다리다 시간 초과되었습니다.";
  } else if (normalizedMessage.includes("선택한 공동인증서 serial이 현재 로컬 인증서와 달라")) {
    simplifiedMessage = "선택한 공동인증서와 현재 로컬 인증서가 일치하지 않습니다.";
  } else if (normalizedMessage.includes("디버그 아티팩트:")) {
    simplifiedMessage = normalizedMessage.split("디버그 아티팩트:")[0]?.trim() || normalizedMessage;
  } else if (normalizedMessage.includes("Call log:")) {
    simplifiedMessage = normalizedMessage.split("Call log:")[0]?.trim() || normalizedMessage;
  }

  return customerName ? `${customerName}: ${simplifiedMessage}` : simplifiedMessage;
}

export function buildElectronicTaxRegistrationFollowupNotice(options: {
  completedNames: string[];
  alreadyRegisteredNames: string[];
  failedDetails: string[];
  refreshWarnings: string[];
  joinedBeforeRegisterCount?: number;
  skippedBeforeJoinCount?: number;
}): string {
  const joinedBeforeRegisterCount = options.joinedBeforeRegisterCount ?? 0;
  const skippedBeforeJoinCount = options.skippedBeforeJoinCount ?? 0;
  const summaryParts = [
    joinedBeforeRegisterCount > 0 ? `발행준비 ${joinedBeforeRegisterCount}건` : null,
    options.completedNames.length > 0 ? `자동 등록 ${options.completedNames.length}건` : null,
    options.alreadyRegisteredNames.length > 0 ? `이미 등록 ${options.alreadyRegisteredNames.length}건` : null,
    options.failedDetails.length > 0 ? `실패 ${options.failedDetails.length}건` : null,
    skippedBeforeJoinCount > 0 ? `가입 전 제외 ${skippedBeforeJoinCount}건` : null
  ].filter((value): value is string => Boolean(value));
  const summarizedFailedDetails = options.failedDetails.map(summarizeElectronicTaxRegistrationFailure);
  const summarizedRefreshWarnings = options.refreshWarnings.map((warning) =>
    warning.replace(/\s+/g, " ").trim()
  );

  return `공동인증서 연결 완료 · ${summaryParts.join(" · ") || "처리 대상 없음"}${
    summarizedFailedDetails.length > 0 ? `\n\n실패 내역\n${summarizedFailedDetails.join("\n")}` : ""
  }${
    skippedBeforeJoinCount > 0
      ? `\n\n제외\n발행 준비 전 ${skippedBeforeJoinCount}건`
      : ""
  }${
    summarizedRefreshWarnings.length > 0 ? `\n\n상태 반영 경고\n${summarizedRefreshWarnings.join("\n")}` : ""
  }`;
}
