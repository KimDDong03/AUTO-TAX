import type { CustomerOnboardingCommitResponse } from "./customer-onboarding-workbook";

export function buildElectronicTaxOnboardingTemplateNotice(certificateCount: number): string {
  return `전자세금용 공동인증서 ${certificateCount}건 기준으로 초기 등록 양식을 내려받았습니다. 발전소 시트에서 등록할 대상만 남기고 발전소명과 필요한 인증서 비밀번호만 입력해 주세요. 업로드 전에는 고객별 전자세금용 인증서 확인 결과와 고객 생성/갱신 가능 여부만 검토합니다.`;
}

export function buildElectronicTaxOnboardingPreviewNotice(options: {
  resolvedCertificateCount: number;
  customerCount: number;
  acceptedBeforeWindowCount: number;
  skippedCertificateCount: number;
  workbookWarnings: string[];
}): string {
  const noticeParts = [
    `전자세금용 인증서 ${options.resolvedCertificateCount}건으로 고객 ${options.customerCount}건을 등록 대상으로 읽었습니다.`,
    "미리보기에서 고객별 전자세금용 인증서 확인 여부, 신규/기존 고객 반영 가능 여부, 실패 사유만 먼저 확인해 주세요."
  ];

  if (options.acceptedBeforeWindowCount > 0) {
    noticeParts.push(
      `갱신 가능 기간 전이지만 사업자 정보 확인에 성공한 전자세금용 인증서 ${options.acceptedBeforeWindowCount}건도 포함했습니다.`
    );
  }
  if (options.skippedCertificateCount > 0) {
    noticeParts.push(
      `자동으로 제외된 인증서는 입력 ${options.skippedCertificateCount}건이 아래 경고에 표시됩니다.`
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
  const summary = `가져오기 완료 · 신규 ${result.createdCount}건 / 갱신 ${result.updatedCount}건 / 전자세금용 인증서 ${result.linkedCertificateCount}건`;
  const warningSummary =
    result.warnings.length > 0 ? `\n경고 ${result.warnings.length}건이 아래 메시지에 남아 있습니다.` : "";
  return `${summary}\n다음 단계에서 전자세금용 공동인증서 등록까지 이어서 진행해 주세요.${warningSummary}`;
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
  skippedBeforeJoinCount?: number;
}): string {
  const skippedBeforeJoinCount = options.skippedBeforeJoinCount ?? 0;
  const summaryParts = [
    options.completedNames.length > 0 ? `자동 등록 ${options.completedNames.length}건` : null,
    options.alreadyRegisteredNames.length > 0 ? `이미 등록 ${options.alreadyRegisteredNames.length}건` : null,
    options.failedDetails.length > 0 ? `실패 ${options.failedDetails.length}건` : null,
    skippedBeforeJoinCount > 0 ? `가입 전 제외 ${skippedBeforeJoinCount}건` : null
  ].filter((value): value is string => Boolean(value));
  const summarizedFailedDetails = options.failedDetails.map(summarizeElectronicTaxRegistrationFailure);
  const summarizedRefreshWarnings = options.refreshWarnings.map((warning) =>
    warning.replace(/\s+/g, " ").trim()
  );

  return `전자세금용 인증서 후속 등록을 마쳤습니다. ${summaryParts.join(" · ") || "처리 대상이 없습니다."}${
    summarizedFailedDetails.length > 0 ? `\n\n실패 내역\n${summarizedFailedDetails.join("\n")}` : ""
  }${
    skippedBeforeJoinCount > 0
      ? `\n\n가입 전 제외\n팝빌 가입이 끝나지 않은 ${skippedBeforeJoinCount}건은 전자세금용 인증서 등록을 시도하지 않았습니다. 가입 완료 후 다시 실행해 주세요.`
      : ""
  }${
    summarizedRefreshWarnings.length > 0 ? `\n\n상태 반영 경고\n${summarizedRefreshWarnings.join("\n")}` : ""
  }`;
}
