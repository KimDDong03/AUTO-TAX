import type {
  CustomerOnboardingCommitResponse
} from "./customer-onboarding-workbook";

export function buildElectronicTaxOnboardingTemplateNotice(certificateCount: number): string {
  return `전자세금용 공동인증서 ${certificateCount}건 기준으로 초기 등록 양식을 다운로드했습니다. 발전소 시트에서 등록할 대상 행만 남기고 발전소명과 필요 시 인증서 비밀번호만 입력하세요. 업로드 후에는 고객별 전자세금용 인증서 확인 결과와 고객 생성/갱신 가능 여부만 검토하면 됩니다.`;
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
    "미리보기에서 고객별 전자세금용 인증서 확인 여부, 신규/기존 고객 반영 가능 여부, 실패 사유만 확인하세요."
  ];

  if (options.acceptedBeforeWindowCount > 0) {
    noticeParts.push(
      `갱신 가능 기간 전이지만 사업자 정보 확인에 성공한 전자세금용 인증서 ${options.acceptedBeforeWindowCount}건도 포함했습니다.`
    );
  }
  if (options.skippedCertificateCount > 0) {
    noticeParts.push(`자동으로 제외한 인증서 또는 입력 ${options.skippedCertificateCount}건은 아래에서 확인하세요.`);
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
  const warningSummary = result.warnings.length > 0 ? `\n경고 ${result.warnings.length}건은 아래 메시지에서 확인하세요.` : "";
  return `${summary}\n다음 단계에서 팝빌 전자세금용 인증서 등록을 이어서 진행하세요.${warningSummary}`;
}

export function buildElectronicTaxRegistrationFollowupNotice(options: {
  completedNames: string[];
  alreadyRegisteredNames: string[];
  failedDetails: string[];
  refreshWarnings: string[];
}): string {
  const summaryParts = [
    options.completedNames.length > 0 ? `자동 등록 ${options.completedNames.length}건` : null,
    options.alreadyRegisteredNames.length > 0 ? `이미 등록 ${options.alreadyRegisteredNames.length}건` : null,
    options.failedDetails.length > 0 ? `실패 ${options.failedDetails.length}건` : null
  ].filter((value): value is string => Boolean(value));

  return `전자세금용 인증서 후속 등록을 마쳤습니다. ${summaryParts.join(" · ") || "처리된 대상이 없습니다."}${
    options.failedDetails.length > 0 ? `\n\n실패 내역\n${options.failedDetails.slice(0, 8).join("\n")}` : ""
  }${
    options.refreshWarnings.length > 0 ? `\n\n상태 반영 경고\n${options.refreshWarnings.slice(0, 5).join("\n")}` : ""
  }`;
}
