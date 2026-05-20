import { useRef, useState } from "react";
import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, Panel, RevealIcon, StatusBadge } from "../../components/ui";
import type { BootstrapPayload } from "../../types";
import type { CustomerOnboardingPreviewResponse } from "./customer-onboarding-workbook";

type QuickRegisterFormState = {
  messageId: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
};

type BillingMonthSummary = {
  billingMonth: string;
  totalCount: number;
  actionableCount: number;
  latestReceivedAt: string | null;
  completed: boolean;
};

type InboxMessage = BootstrapPayload["inbox"][number];
export type InitialRegistrationTabMode = "registration" | "exceptions";
export type InitialRegistrationStage = "download" | "upload" | "commit" | "certificate" | "done";
type InitialRegistrationStepStatus = "complete" | "current" | "locked";

type InitialRegistrationFlowStateInput = {
  helperReady: boolean;
  helperCertificateCount: number;
  registrationReady: boolean;
  certificateReady: boolean;
  certificateAutoTargetCount: number;
  certificatePendingJoinCount: number;
  certificateFailedJoinCount: number;
  certificateRetryCount: number;
  templateDownloaded: boolean;
  previewReady: boolean;
  commitDone: boolean;
  importableCount: number;
  blockedCount: number;
  hasSelectedFile: boolean;
};

type InitialRegistrationStepItem = {
  step: number;
  title: string;
  description: string;
  status: InitialRegistrationStepStatus;
  statusLabel: string;
};

type CertificatePasswordOverrideEntry = {
  businessNumber: string;
  customerName: string;
  corpName: string;
  value: string;
};

type InitialStatusNoticeTone = "info" | "progress" | "success" | "warn" | "danger";

function getInitialStatusNoticeIcon(tone: InitialStatusNoticeTone) {
  if (tone === "progress") return "loader-circle";
  if (tone === "success") return "complete";
  if (tone === "warn") return "warning";
  if (tone === "danger") return "alert-triangle";
  return "bell";
}

function InitialStatusNotice(props: {
  title: string;
  message: string;
  tone?: InitialStatusNoticeTone;
}) {
  const tone = props.tone ?? "info";
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      className={`initial-status-notice initial-status-notice-${tone}`}
    >
      <Icon name={getInitialStatusNoticeIcon(tone)} className={tone === "progress" ? "is-spinning" : undefined} />
      <div>
        <AlertTitle>{props.title}</AlertTitle>
        <AlertDescription className="helper-multiline-text helper-multiline-scroll">
          {props.message}
        </AlertDescription>
      </div>
    </Alert>
  );
}

function InitialStatusMetric(props: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon name={props.icon} />
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export type InitialRegistrationFlowState = {
  stage: InitialRegistrationStage;
  primaryActionLabel: string;
  blockedReason?: string;
  headline: string;
  description: string;
  downloadCompleted: boolean;
  uploadCompleted: boolean;
  commitCompleted: boolean;
  needsUploadRetry: boolean;
  stepItems: InitialRegistrationStepItem[];
};

function getInitialRegistrationStepMeta(status: InitialRegistrationStepStatus) {
  if (status === "complete") {
    return { statusLabel: "완료" };
  }

  if (status === "current") {
    return { statusLabel: "지금" };
  }

  return { statusLabel: "대기" };
}

function getInitialStepBadgeVariant(status: InitialRegistrationStepStatus) {
  if (status === "complete") return "secondary";
  if (status === "current") return "default";
  return "outline";
}

export function getInitialRegistrationFlowState(input: InitialRegistrationFlowStateInput): InitialRegistrationFlowState {
  const commitSubmitted = input.commitDone;
  const commitCompleted = input.registrationReady;
  const uploadCompleted = input.previewReady || commitSubmitted || commitCompleted;
  const downloadCompleted = input.templateDownloaded || uploadCompleted;
  const certificateCompleted = commitCompleted && input.certificateReady;
  const canCommit = input.importableCount > 0;
  const needsUploadRetry = uploadCompleted && !commitSubmitted && !commitCompleted && !canCommit;
  const hasElectronicTaxCertificates = input.helperCertificateCount > 0;
  const certificatePendingCount =
    input.certificateAutoTargetCount +
    input.certificatePendingJoinCount +
    input.certificateFailedJoinCount;
  const stage: InitialRegistrationStage = certificateCompleted
    ? "done"
    : !downloadCompleted
      ? "download"
      : !uploadCompleted || needsUploadRetry
        ? "upload"
        : !commitCompleted
          ? "commit"
          : "certificate";
  const blockedReason =
    !input.helperReady && !downloadCompleted
      ? "먼저 전자세금용 공동인증서를 읽으세요."
      : !downloadCompleted && input.helperReady && !hasElectronicTaxCertificates
        ? "이 PC에서 전자세금용 공동인증서를 찾지 못했습니다."
        : needsUploadRetry
          ? `검토 ${input.blockedCount}건 수정 후 다시 업로드하세요.`
        : stage === "commit" && commitSubmitted && input.certificatePendingJoinCount > 0
          ? `발행 연동 가입 대기 ${input.certificatePendingJoinCount}건`
        : stage === "commit" && commitSubmitted && input.certificateFailedJoinCount > 0
          ? `발행 연동 확인 필요 ${input.certificateFailedJoinCount}건`
        : stage === "certificate" && input.certificatePendingJoinCount > 0
          ? `발행 연동 처리 대기 ${input.certificatePendingJoinCount}건`
          : stage === "certificate" && input.certificateFailedJoinCount > 0
            ? `등록 처리 확인이 필요한 고객 ${input.certificateFailedJoinCount}건이 있습니다.`
              : undefined;
  const templateStepStatus: InitialRegistrationStepStatus = uploadCompleted
    ? "complete"
    : stage === "download" || stage === "upload"
      ? "current"
      : "locked";
  const certificateStepStatus: InitialRegistrationStepStatus = certificateCompleted
    ? "complete"
    : stage === "certificate"
      ? "current"
      : "locked";
  const headline = certificateCompleted
    ? "고객 등록 완료"
    : stage === "download"
      ? "지금 할 일 · 양식 다운로드"
      : stage === "upload"
        ? needsUploadRetry
          ? "지금 할 일 · 다시 업로드"
          : "지금 할 일 · 양식 업로드"
        : stage === "commit"
          ? "지금 할 일 · 고객 반영"
          : "지금 할 일 · 공동인증서 반영";
  const description = certificateCompleted
    ? "다음 단계로 이동"
    : stage === "download"
      ? input.helperReady
        ? hasElectronicTaxCertificates
          ? `전자세금용 인증서 ${input.helperCertificateCount}건 기준`
          : "전자세금용 없음"
        : "AT 헬퍼 필요"
      : stage === "commit"
        ? commitSubmitted && input.certificatePendingJoinCount > 0
          ? `가입 대기 ${input.certificatePendingJoinCount}건`
          : commitSubmitted && input.certificateFailedJoinCount > 0
            ? `확인 필요 ${input.certificateFailedJoinCount}건`
            : `반영 ${input.importableCount}건`
        : stage === "certificate"
          ? input.certificateAutoTargetCount > 0 && input.certificateRetryCount > 0
            ? `인증서 연결 다시 시도 ${input.certificateRetryCount}건`
            : input.certificateAutoTargetCount > 0
              ? `등록 대기 ${input.certificateAutoTargetCount}건`
              : input.certificatePendingJoinCount > 0
                ? `발행 연동 처리 대기`
                : input.certificateFailedJoinCount > 0
                  ? `등록 처리 확인 필요 ${input.certificateFailedJoinCount}건`
                  : certificatePendingCount > 0
                    ? `추가 확인 ${certificatePendingCount}건`
                    : "연결 확인"
          : needsUploadRetry
            ? `검토 ${input.blockedCount}건`
            : input.hasSelectedFile
              ? "업로드 준비"
              : "파일 선택";
  const primaryActionLabel = certificateCompleted
    ? "등록 완료"
    : stage === "download"
      ? "양식 다운로드"
      : stage === "commit"
        ? "고객 등록 반영"
        : stage === "certificate"
          ? input.certificateAutoTargetCount > 0 && input.certificateRetryCount > 0
            ? "공동인증서 반영 다시 시도"
            : input.certificateAutoTargetCount > 0
              ? "공동인증서 반영"
              : input.certificatePendingJoinCount > 0
                ? "발행 연동 다시 확인"
                : input.certificateFailedJoinCount > 0
                  ? "고객 관리에서 확인"
                  : "다음 단계 보기"
          : uploadCompleted || input.hasSelectedFile
            ? "다시 업로드"
            : "양식 업로드";
  const stepItems: InitialRegistrationStepItem[] = [
    {
      step: 1,
      title: "양식 받기/올리기",
      description: uploadCompleted
        ? needsUploadRetry
          ? "재업로드"
          : "완료"
        : downloadCompleted
          ? input.hasSelectedFile
            ? "선택됨"
            : "업로드"
          : input.helperReady
            ? hasElectronicTaxCertificates
              ? "다운로드 후 업로드"
              : "전자세금용 없음"
            : "AT 헬퍼 필요",
      status: templateStepStatus,
      ...getInitialRegistrationStepMeta(templateStepStatus)
    },
    {
      step: 2,
      title: "고객 반영",
      description: commitCompleted
        ? "완료"
        : commitSubmitted && input.certificatePendingJoinCount > 0
          ? `가입 대기 ${input.certificatePendingJoinCount}건`
        : commitSubmitted && input.certificateFailedJoinCount > 0
          ? `확인 필요 ${input.certificateFailedJoinCount}건`
        : canCommit
          ? `반영 ${input.importableCount}건`
          : uploadCompleted
            ? "업로드 후 확인"
            : "대기",
      status: commitCompleted ? "complete" : stage === "commit" ? "current" : "locked",
      ...getInitialRegistrationStepMeta(commitCompleted ? "complete" : stage === "commit" ? "current" : "locked")
    },
    {
      step: 3,
      title: "공동인증서 반영",
      description: certificateCompleted
        ? "완료"
        : input.certificateAutoTargetCount > 0 && input.certificateRetryCount > 0
          ? `재시도 ${input.certificateRetryCount}건`
        : input.certificateAutoTargetCount > 0
            ? `등록 대기 ${input.certificateAutoTargetCount}건`
            : input.certificatePendingJoinCount > 0
              ? `대기 ${input.certificatePendingJoinCount}건`
              : input.certificateFailedJoinCount > 0
                ? `가입 확인 ${input.certificateFailedJoinCount}건`
                : certificatePendingCount > 0
                  ? `추가 확인 ${certificatePendingCount}건`
                  : "대기",
      status: certificateStepStatus,
      ...getInitialRegistrationStepMeta(certificateStepStatus)
    }
  ];

  return {
    stage,
    primaryActionLabel,
    blockedReason,
    headline,
    description,
    downloadCompleted,
    uploadCompleted,
    commitCompleted,
    needsUploadRetry,
    stepItems
  };
}

export function shouldShowInitialRegistrationTemplateActions(input: {
  mode: InitialRegistrationTabMode;
  registrationStage: InitialRegistrationStage;
  uploadCompleted: boolean;
  templateStepSelected: boolean;
}) {
  return (
    input.mode === "registration" &&
    (input.registrationStage === "download" ||
      input.registrationStage === "upload" ||
      (input.uploadCompleted && input.templateStepSelected))
  );
}

type InitialRegistrationTabProps = {
  mode: InitialRegistrationTabMode;
  busyKey: string | null;
  customerOnboardingFileName: string;
  customerOnboardingPreview: CustomerOnboardingPreviewResponse | null;
  customerOnboardingNotice: string;
  customerOnboardingError: string;
  pendingOnboardingCertificateRegistrationCount: number;
  quickRegisterMessages: InboxMessage[];
  quickRegisterForm: QuickRegisterFormState;
  selectedQuickRegisterMessage: InboxMessage | null;
  isQuickRegistering: boolean;
  quickRegisterNotice: string;
  quickRegisterError: string;
  billingMonthSummaries: BillingMonthSummary[];
  completedBillingNotice: string;
  helperReady: boolean;
  helperCertificateCount: number;
  registrationReady?: boolean;
  certificateReady?: boolean;
  certificateAutoTargetCount?: number;
  certificatePendingJoinCount?: number;
  certificateFailedJoinCount?: number;
  certificateRetryCount?: number;
  certificatePrimaryActionLabel?: string;
  certificateActionDisabled?: boolean;
  certificateActionTitle?: string;
  registrationStage?: InitialRegistrationStage;
  registrationBlockedReason?: string;
  registrationTemplateDownloaded?: boolean;
  registrationPreviewReady?: boolean;
  registrationCommitDone?: boolean;
  customerOnboardingSharedPassword: string;
  onCustomerOnboardingSharedPasswordChange: (value: string) => void;
  certificatePasswordOverrideEntries: CertificatePasswordOverrideEntry[];
  onCertificatePasswordOverrideChange: (businessNumber: string, value: string) => void;
  showBillingMonthCompletion?: boolean;
  downloadCustomerOnboardingTemplate: () => Promise<void>;
  handleCustomerOnboardingFileChange: (file: File | null) => Promise<void>;
  commitCustomerOnboardingWorkbook: () => Promise<void>;
  proceedOnboardingCertificateFollowUp: () => void;
  setQuickRegisterForm: React.Dispatch<React.SetStateAction<QuickRegisterFormState>>;
  selectQuickRegisterMessage: (messageId: number) => void;
  submitQuickRegister: () => Promise<void>;
  onReprocessInboxMessage: (messageId: number) => Promise<void>;
  markBillingMonthCompleted: (summary: BillingMonthSummary) => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatDateTime: (value: string | null) => string;
  formatMoney: (value: number) => string;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
};

export function InitialRegistrationTab(props: InitialRegistrationTabProps) {
  const onboardingFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sharedPasswordVisible, setSharedPasswordVisible] = useState(false);
  const [selectedRegistrationStep, setSelectedRegistrationStep] = useState<number | null>(null);
  const onboardingBusyKey = props.busyKey?.startsWith("customer-onboarding-") ? props.busyKey : null;
  const isDownloadingOnboardingTemplate = onboardingBusyKey === "customer-onboarding-template";
  const isPreviewingOnboarding = onboardingBusyKey === "customer-onboarding-preview";
  const isCommittingOnboarding = onboardingBusyKey === "customer-onboarding-commit";
  const onboardingImportableCount =
    (props.customerOnboardingPreview?.createCount ?? 0) + (props.customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = props.customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;
  const showBillingMonthCompletion = props.showBillingMonthCompletion ?? props.mode === "exceptions";
  const hasExceptionMessages = props.quickRegisterMessages.length > 0;
  const registrationReady = props.registrationReady ?? false;
  const certificateReady = props.certificateReady ?? false;
  const registrationFlow = getInitialRegistrationFlowState({
    helperReady: props.helperReady,
    helperCertificateCount: props.helperCertificateCount,
    registrationReady,
    certificateReady,
    certificateAutoTargetCount: props.certificateAutoTargetCount ?? 0,
    certificatePendingJoinCount: props.certificatePendingJoinCount ?? 0,
    certificateFailedJoinCount: props.certificateFailedJoinCount ?? 0,
    certificateRetryCount: props.certificateRetryCount ?? 0,
    templateDownloaded: props.registrationTemplateDownloaded ?? false,
    previewReady: props.registrationPreviewReady ?? Boolean(props.customerOnboardingPreview),
    commitDone: props.registrationCommitDone ?? registrationReady,
    importableCount: onboardingImportableCount,
    blockedCount: onboardingBlockedCount,
    hasSelectedFile: Boolean(props.customerOnboardingFileName)
  });
  const registrationStage = props.registrationStage ?? registrationFlow.stage;
  const isTemplateStage = registrationStage === "download" || registrationStage === "upload";
  const isTemplateStepSelected =
    props.mode === "registration" &&
    selectedRegistrationStep === 1 &&
    registrationFlow.uploadCompleted &&
    !isTemplateStage;
  const isCommitStepSelected =
    props.mode === "registration" &&
    selectedRegistrationStep === 2 &&
    registrationFlow.uploadCompleted;
  const isCertificateStepSelected =
    props.mode === "registration" &&
    selectedRegistrationStep === 3 &&
    registrationFlow.commitCompleted;
  const showSharedPasswordField =
    props.mode === "registration" &&
    (isTemplateStage ||
      isTemplateStepSelected ||
      registrationStage === "commit" ||
      isCommitStepSelected ||
      registrationStage === "certificate" ||
      isCertificateStepSelected);
  const registrationTaskTitle = isTemplateStage || isTemplateStepSelected
    ? "양식 받기/올리기"
    : isCertificateStepSelected
      ? "공동인증서 반영"
      : registrationFlow.headline.replace("지금 할 일 · ", "");
  const registrationTaskDescription = isTemplateStepSelected
    ? "양식을 다시 받거나 올릴 수 있습니다."
    : registrationFlow.description;
  const selectedRegistrationTaskTitle = isCommitStepSelected ? "고객 반영" : registrationTaskTitle;
  const selectedRegistrationTaskDescription = isCommitStepSelected
    ? registrationFlow.commitCompleted
      ? "고객 등록과 발행 연동이 완료되었습니다."
      : registrationFlow.description
    : isCertificateStepSelected
      ? registrationFlow.description
    : registrationTaskDescription;
  const sharedPasswordReady = props.customerOnboardingSharedPassword.trim() !== "";
  const canDownloadOnboardingTemplate = props.helperReady && props.helperCertificateCount > 0;
  const uploadBlockedTitle = !sharedPasswordReady
    ? "공통 비밀번호 입력 후 업로드하세요."
    : undefined;
  const downloadBlockedTitle = !props.helperReady
    ? "먼저 공동인증서를 읽어주세요."
    : props.helperCertificateCount === 0
      ? "이 PC에서 전자세금용 공동인증서를 먼저 확인하세요."
      : undefined;
  const billingMonthCompletionList = props.billingMonthSummaries.length > 0 ? (
    <div className="list month-completion-list">
      {props.billingMonthSummaries.map((summary) => (
        <div key={summary.billingMonth} className={summary.completed ? "month-summary completed" : "month-summary"}>
          <div className="customer-summary-head">
            <div>
              <strong>{summary.billingMonth}</strong>
              <p>
                메일 {summary.totalCount}건
                {summary.actionableCount > 0 ? ` · 확인 필요 ${summary.actionableCount}건` : ""}
                {summary.latestReceivedAt ? ` · 최근 수신 ${props.formatDateTime(summary.latestReceivedAt)}` : ""}
              </p>
            </div>
            {summary.completed ? (
              <StatusBadge tone="success">완료 처리</StatusBadge>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() =>
                  void props.runAction(`complete-billing-month-${summary.billingMonth}`, () => props.markBillingMonthCompleted(summary), {
                    reload: false
                  })
                }
              >
                완료 처리
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty">정산월이 파싱된 메일이 아직 없습니다.</div>
  );
  const registrationPrimaryAction =
    props.mode !== "registration" || registrationStage === "done" || isTemplateStepSelected
      ? null
      : registrationStage === "download"
        ? null
        : registrationStage === "upload"
          ? null
          : isCommitStepSelected
            ? {
                label: registrationFlow.commitCompleted
                  ? "고객 연동 완료"
                  : isCommittingOnboarding
                    ? "연동 중..."
                    : "고객 연동",
                disabled:
                  registrationFlow.commitCompleted ||
                  props.busyKey !== null ||
                  !props.customerOnboardingPreview ||
                  onboardingImportableCount === 0,
                title: registrationFlow.commitCompleted ? "고객 연동이 완료되었습니다." : undefined,
                onClick: () =>
                  void props.runAction(
                    "customer-onboarding-commit",
                    props.commitCustomerOnboardingWorkbook,
                    { reload: false }
                  )
              }
          : registrationStage === "commit" && !registrationFlow.commitCompleted
            ? {
                label: isCommittingOnboarding ? "연동 중..." : "고객 연동",
                disabled: props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0,
                title: undefined,
                onClick: () =>
                  void props.runAction(
                    "customer-onboarding-commit",
                    props.commitCustomerOnboardingWorkbook,
                    { reload: false }
                  )
              }
            : registrationStage === "certificate" || isCertificateStepSelected
              ? {
                  label:
                    props.busyKey === "customer-onboarding-cert-registration"
                      ? "공동인증서 반영 중..."
                      : props.certificatePrimaryActionLabel ?? registrationFlow.primaryActionLabel,
                  disabled: props.certificateActionDisabled ?? props.busyKey !== null,
                  title: props.certificateActionTitle,
                  onClick: props.proceedOnboardingCertificateFollowUp
                }
            : null;
  const showTemplateActions = shouldShowInitialRegistrationTemplateActions({
    mode: props.mode,
    registrationStage,
    uploadCompleted: registrationFlow.uploadCompleted,
    templateStepSelected: selectedRegistrationStep === 1
  });
  const showOnboardingInlineStatus = Boolean(props.customerOnboardingFileName || props.customerOnboardingPreview);
  const uploadProgressMessage = isPreviewingOnboarding
    ? props.customerOnboardingNotice || "양식 업로드를 확인하는 중입니다..."
    : "";
  const showCertificatePasswordOverrides =
    !registrationFlow.commitCompleted &&
    props.certificatePasswordOverrideEntries.length > 0;
  const selectedExceptionStatus = props.selectedQuickRegisterMessage
    ? props.getInboxDisplayParseStatus(props.selectedQuickRegisterMessage)
    : null;
  const canQuickRegisterSelectedMessage =
    selectedExceptionStatus === "unmatched" && props.selectedQuickRegisterMessage !== null;
  const exceptionStatusCounts = props.quickRegisterMessages.reduce(
    (acc, message) => {
      const status = props.getInboxDisplayParseStatus(message);
      if (status === "unmatched") {
        acc.unmatched += 1;
      } else if (status === "failed") {
        acc.failed += 1;
      } else if (status === "duplicate") {
        acc.duplicate += 1;
      }
      return acc;
    },
    { unmatched: 0, failed: 0, duplicate: 0 }
  );
  const exceptionStatusSummary = [
    exceptionStatusCounts.unmatched > 0 ? `고객 미매칭 ${exceptionStatusCounts.unmatched}건` : null,
    exceptionStatusCounts.failed > 0 ? `파싱 실패 ${exceptionStatusCounts.failed}건` : null,
    exceptionStatusCounts.duplicate > 0 ? `중복 의심 ${exceptionStatusCounts.duplicate}건` : null
  ]
    .filter(Boolean)
    .join(" · ");
  const previewRows = props.customerOnboardingPreview?.rows ?? [];
  const blockedPreviewRows = previewRows.filter((row) => row.status === "blocked");
  const firstBlockedPreviewRow = blockedPreviewRows[0] ?? null;
  const visibleRegistrationSteps = registrationFlow.stepItems;
  const previewSummaryItems = props.customerOnboardingPreview
    ? [
        { label: "전체 고객", value: `${props.customerOnboardingPreview.totalCustomers}건` },
        { label: "신규", value: `${props.customerOnboardingPreview.createCount}건` },
        { label: "갱신", value: `${props.customerOnboardingPreview.updateCount}건` },
        { label: "검토 필요", value: `${props.customerOnboardingPreview.blockedCount}건` },
        { label: "발전소", value: `${props.customerOnboardingPreview.totalPlants}건` },
        { label: "인증서", value: `${props.customerOnboardingPreview.totalCertificates}건` }
      ]
    : [];

  return (
    <div className="initial-screen">
      {props.mode === "registration" ? (
        <>
          <input
            ref={onboardingFileInputRef}
            type="file"
            accept=".xlsx,.xlsm"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void props.runAction(
                "customer-onboarding-preview",
                async () => props.handleCustomerOnboardingFileChange(file),
                { reload: false }
              );
              event.currentTarget.value = "";
            }}
          />
          <section className="onboarding-main-card panel-initial-onboarding" data-stage={registrationStage}>
            <div className="onboarding-main-head">
              <div className="onboarding-main-copy onboarding-main-copy-focal">
                <strong>{selectedRegistrationTaskTitle}</strong>
                <p>{selectedRegistrationTaskDescription}</p>
                {showSharedPasswordField ? (
                  <label className="settings-defaults-cell settings-defaults-cell-span-2">
                    공통 공동인증서 비밀번호 (1회성)
                    <div className="password-field">
                      <input
                        type={sharedPasswordVisible ? "text" : "password"}
                        value={props.customerOnboardingSharedPassword}
                        disabled={props.busyKey !== null}
                        onChange={(event) =>
                          props.onCustomerOnboardingSharedPasswordChange(event.target.value)
                        }
                        placeholder="발전소 시트 비밀번호 칸이 비면 이 값을 사용"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={
                          sharedPasswordVisible
                            ? "공통 공동인증서 비밀번호 숨기기"
                            : "공통 공동인증서 비밀번호 보기"
                        }
                        onClick={() => setSharedPasswordVisible((prev) => !prev)}
                      >
                        <RevealIcon open={sharedPasswordVisible} />
                      </button>
                    </div>
                    <span className="field-hint">
                      이번 업로드에서만 사용합니다.
                    </span>
                  </label>
                ) : null}
                {showTemplateActions ? (
                  <div className="button-row onboarding-primary-row onboarding-primary-row-focal">
                    <Button
                      type="button"
                      size="sm"
                      disabled={props.busyKey !== null || !canDownloadOnboardingTemplate}
                      title={downloadBlockedTitle}
                      onClick={() =>
                        void props.runAction(
                          "customer-onboarding-template",
                          props.downloadCustomerOnboardingTemplate,
                          { reload: false }
                        )
                      }
                    >
                      {isDownloadingOnboardingTemplate ? "다운로드 중..." : "양식 다운로드"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={props.busyKey !== null || !sharedPasswordReady}
                      title={uploadBlockedTitle}
                      onClick={() => onboardingFileInputRef.current?.click()}
                    >
                      {isPreviewingOnboarding
                        ? "확인 중..."
                        : registrationFlow.uploadCompleted
                          ? "다시 업로드"
                          : "양식 업로드"}
                    </Button>
                  </div>
                ) : null}
                {registrationPrimaryAction ? (
                  <div className="button-row onboarding-primary-row onboarding-primary-row-focal">
                    <Button
                      type="button"
                      size="sm"
                      disabled={registrationPrimaryAction.disabled}
                      title={registrationPrimaryAction.title}
                      onClick={registrationPrimaryAction.onClick}
                    >
                      {registrationPrimaryAction.label}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <ol className="onboarding-stage-list">
              {visibleRegistrationSteps.map((item) => {
                const isClickableStep =
                  props.mode === "registration" &&
                  ((item.step === 1 && registrationFlow.uploadCompleted) ||
                    (item.step === 2 && registrationFlow.uploadCompleted) ||
                    (item.step === 3 && registrationFlow.commitCompleted));
                const selectStep = () => {
                  if (!isClickableStep) {
                    return;
                  }

                  setSelectedRegistrationStep(item.step);
                };

                return (
                  <li
                    key={`onboarding-registration-step-${item.step}`}
                    data-status={item.status}
                    className={[
                      "onboarding-stage-item",
                      item.status === "current" ? "is-current" : "",
                      item.status === "complete" ? "is-complete" : "",
                      item.status === "locked" ? "is-locked" : "",
                      isClickableStep ? "is-clickable" : "",
                      selectedRegistrationStep === item.step ? "is-selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role={isClickableStep ? "button" : undefined}
                    tabIndex={isClickableStep ? 0 : undefined}
                    onClick={selectStep}
                    onKeyDown={(event) => {
                      if (!isClickableStep || (event.key !== "Enter" && event.key !== " ")) {
                        return;
                      }

                      event.preventDefault();
                      selectStep();
                    }}
                  >
                    <span className="onboarding-stage-number">{item.step}</span>
                    <div className="onboarding-stage-copy">
                      <div className="initial-onboarding-step-head">
                        <strong>{item.title}</strong>
                        <Badge
                          variant={getInitialStepBadgeVariant(item.status)}
                          className={`initial-step-badge initial-step-badge-${item.status}`}
                        >
                          {item.statusLabel}
                        </Badge>
                      </div>
                      <p>{item.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {showOnboardingInlineStatus ? (
              <div className="onboarding-inline-status">
                <InitialStatusMetric icon="file-text" label="파일" value={props.customerOnboardingFileName || "선택됨"} />
                <InitialStatusMetric icon="group" label="반영" value={`${onboardingImportableCount}건`} />
                <InitialStatusMetric icon={onboardingBlockedCount > 0 ? "warning" : "complete"} label="검토" value={`${onboardingBlockedCount}건`} />
              </div>
            ) : null}
          </section>

          {uploadProgressMessage ? (
            <InitialStatusNotice title="진행 중" message={uploadProgressMessage} tone="progress" />
          ) : null}

          {!registrationFlow.commitCompleted && !showTemplateActions ? (
            <details className="onboarding-advanced-details onboarding-assist-details">
              <summary>보조 작업 보기</summary>
              <div className="helper-box-stack onboarding-assist-body">
                <strong>보조 작업</strong>
                <div className="button-row">
                  {registrationStage !== "download" ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={props.busyKey !== null || !props.helperReady || props.helperCertificateCount === 0}
                      onClick={() => void props.runAction("customer-onboarding-template", props.downloadCustomerOnboardingTemplate, { reload: false })}
                      title={
                        !props.helperReady
                          ? "먼저 공동인증서를 읽어주세요."
                          : props.helperCertificateCount === 0
                            ? "이 PC에서 전자세금용 공동인증서를 먼저 확인하세요."
                            : undefined
                      }
                    >
                      양식 다시 다운로드
                    </button>
                  ) : null}
                  {registrationStage !== "upload" ? (
                    <button type="button" className="btn-secondary" disabled={props.busyKey !== null} onClick={() => onboardingFileInputRef.current?.click()}>
                      양식 업로드
                    </button>
                  ) : null}
                  {registrationStage !== "commit" && onboardingImportableCount > 0 ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0}
                      onClick={() => void props.runAction("customer-onboarding-commit", props.commitCustomerOnboardingWorkbook, { reload: false })}
                    >
                      고객 등록 반영
                    </button>
                  ) : null}
                </div>
              </div>
            </details>
          ) : null}

          {props.customerOnboardingNotice && !registrationFlow.blockedReason ? (
            <InitialStatusNotice title="안내" message={props.customerOnboardingNotice} tone={registrationFlow.commitCompleted ? "success" : "info"} />
          ) : null}
          {showCertificatePasswordOverrides ? (
            <div className="helper-box import-helper-box">
              <strong>사전조회 비밀번호 예외 입력</strong>
              <span className="helper-multiline-text helper-multiline-scroll">
                비밀번호 오류가 난 인증서만 표시합니다. 실제 비밀번호 입력 후 다시 업로드하세요.
              </span>
              <div className="form-grid">
                {props.certificatePasswordOverrideEntries.map((entry) => (
                  <label
                    key={`initial-registration-cert-password-${entry.businessNumber}`}
                    className="settings-defaults-cell settings-defaults-cell-span-2"
                  >
                    {entry.customerName}
                    <span className="field-hint">{entry.corpName || entry.businessNumber}</span>
                    <input
                      type="password"
                      value={entry.value}
                      disabled={props.busyKey !== null}
                      onChange={(event) =>
                        props.onCertificatePasswordOverrideChange(entry.businessNumber, event.target.value)
                      }
                      placeholder="다른 비밀번호일 때만 입력"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {props.customerOnboardingError ? (
            <InitialStatusNotice title="확인 필요" message={props.customerOnboardingError} tone="danger" />
          ) : null}
          {props.customerOnboardingPreview?.fileErrors.length ? (
            <InitialStatusNotice title="시트 연결 오류" message={props.customerOnboardingPreview.fileErrors.join("\n")} tone="warn" />
          ) : null}
          {previewRows.length > 0 ? (
            <section className="initial-preview-console" aria-label="고객 초기 등록 미리보기">
              <div className="initial-preview-summary">
                {previewSummaryItems.map((item) => (
                  <div key={item.label} className="initial-preview-summary-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <div className="initial-preview-grid">
                <div className="initial-preview-table-card">
                  <div className="initial-preview-card-head">
                    <strong>반영 미리 보기</strong>
                    <span className="chip">{previewRows.length}건</span>
                  </div>
                  <div className="initial-preview-table-wrap">
                    <table className="responsive-table initial-preview-table">
                      <thead>
                        <tr>
                          <th>행</th>
                          <th>고객</th>
                          <th>상태</th>
                          <th>구성</th>
                          <th>문제 사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => {
                          const toneClass =
                            row.status === "blocked" ? "chip-danger" : row.status === "update" ? "chip-warn" : "chip-success";
                          const statusLabel = row.status === "blocked" ? "검토 필요" : row.status === "update" ? "기존 고객 갱신" : "신규 등록";
                          const issueText = [...row.errors, ...row.warnings].join(" ") || "-";

                          return (
                            <tr key={`customer-onboarding-${row.rowIndex}-${row.businessNumber}`} className={row.status === "blocked" ? "is-blocked" : undefined}>
                              <td data-label="행">{row.rowIndex}</td>
                              <td data-label="고객">
                                <div className="initial-preview-customer">
                                  <strong>{row.corpName || row.customerName || `고객 ${row.rowIndex}행`}</strong>
                                  <span>{row.businessNumber || "-"}</span>
                                </div>
                              </td>
                              <td data-label="상태">
                                <span className={`chip ${toneClass}`}>{statusLabel}</span>
                              </td>
                              <td data-label="구성">
                                발전소 {row.plantCount}건 · 인증서 {row.certificateCount}건
                              </td>
                              <td data-label="문제 사유">
                                <span className={row.errors.length > 0 ? "text-danger" : row.warnings.length > 0 ? "text-warn" : undefined}>
                                  {issueText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <aside className="initial-preview-blocked-card">
                  <div className="initial-preview-card-head">
                    <strong>막힌 행 상세</strong>
                    <span className={blockedPreviewRows.length > 0 ? "chip chip-danger" : "chip chip-success"}>
                      {blockedPreviewRows.length}건
                    </span>
                  </div>
                  {firstBlockedPreviewRow ? (
                    <div className="initial-preview-blocked-body">
                      <strong>{firstBlockedPreviewRow.corpName || firstBlockedPreviewRow.customerName || `${firstBlockedPreviewRow.rowIndex}행`}</strong>
                      <span>{firstBlockedPreviewRow.businessNumber || "사업자번호 없음"}</span>
                      <div className="initial-preview-issue-list">
                        {firstBlockedPreviewRow.errors.map((error) => (
                          <p key={`blocked-error-${error}`} className="text-danger">{error}</p>
                        ))}
                        {firstBlockedPreviewRow.warnings.map((warning) => (
                          <p key={`blocked-warning-${warning}`} className="text-warn">{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="context-empty-state tone-success">
                      <strong>막힌 행이 없습니다.</strong>
                      <p>미리보기 결과를 확인한 뒤 고객 등록 반영을 진행하면 됩니다.</p>
                    </div>
                  )}
                </aside>
              </div>
            </section>
          ) : null}
        </>
      ) : !hasExceptionMessages ? (
        <div className="context-empty-state tone-success">
          <strong>지금 처리할 예외 메일이 없습니다.</strong>
          <p>이 단계는 첫 메일 동기화 뒤 자동 매칭에서 남은 주소 예외나 특수 케이스만 다룹니다. 지금은 마지막 8단계에서 첫 발행 결과를 확인하면 됩니다.</p>
        </div>
      ) : (
        <>
          <div className="helper-box import-helper-box">
            <strong>미매칭 메일 예외 처리</strong>
            <span>자동 매칭에서 남은 메일만 확인하고, 필요한 값만 보완합니다.</span>
            {exceptionStatusSummary ? <span>{exceptionStatusSummary}</span> : null}
          </div>

          <div className="import-layout exception-triage-layout">
            <Panel
              className="panel-initial-unmatched"
              title={`예외 메일 ${props.quickRegisterMessages.length}건`}
              subtitle="자동 매칭에서 바로 처리하기 어려운 메일만 모아 둔 목록입니다."
            >
              <div className="list initial-unmatched-list">
                {props.quickRegisterMessages.map((message) => {
                  const isSelected = props.quickRegisterForm.messageId === message.id;
                  const messageStatus = props.getInboxDisplayParseStatus(message);
                  return (
                    <button
                      key={message.id}
                      type="button"
                      className={isSelected ? "customer-summary selected" : "customer-summary"}
                      onClick={() => props.selectQuickRegisterMessage(message.id)}
                    >
                      <div className="customer-summary-head">
                        <div>
                          <strong>{message.parsedData?.plantAddress || message.parsedData?.plantName || "주소/발전소 정보 없음"}</strong>
                          <p>{message.subject}</p>
                        </div>
                        <StatusBadge tone={messageStatus === "failed" ? "danger" : messageStatus === "unmatched" ? "warn" : "info"}>
                          {props.getParseStatusLabel(messageStatus)}
                        </StatusBadge>
                      </div>
                      <div className="customer-summary-meta">
                        <span>{message.parsedData?.billingMonth || "-"}</span>
                        <span>{props.formatDateTime(message.receivedAt)}</span>
                        {message.parseError ? <span className="text-danger">{message.parseError}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel
              className="panel-initial-quick-register"
              title="선택 메일 처리"
              subtitle="상태에 따라 고객 등록 보완 또는 재처리를 진행합니다."
            >
              {props.selectedQuickRegisterMessage ? (
                <>
                  <div className="quick-register-selected">
                    <strong>{props.selectedQuickRegisterMessage.subject}</strong>
                    <div className="quick-register-meta">
                      <span>{props.getParseStatusLabel(selectedExceptionStatus ?? props.selectedQuickRegisterMessage.parseStatus)}</span>
                      <span>{props.selectedQuickRegisterMessage.parsedData?.billingMonth || "정산월 없음"}</span>
                      <span>{props.selectedQuickRegisterMessage.parsedData?.plantName || "발전소명 없음"}</span>
                      <span>{props.formatDateTime(props.selectedQuickRegisterMessage.receivedAt)}</span>
                    </div>
                  </div>
                  <div className="helper-box import-helper-box">
                    <strong>메일에서 읽은 값</strong>
                    <span className="helper-multiline-text helper-multiline-scroll">
                      {`보낸 주소: ${props.selectedQuickRegisterMessage.fromAddress || "-"}\n`}
                      {`정산월: ${props.selectedQuickRegisterMessage.parsedData?.billingMonth || "-"}\n`}
                      {`발전소명: ${props.selectedQuickRegisterMessage.parsedData?.plantName || "-"}\n`}
                      {`발전소 주소: ${props.selectedQuickRegisterMessage.parsedData?.plantAddress || "-"}\n`}
                      {`품목: ${props.selectedQuickRegisterMessage.parsedData?.itemName || "-"}\n`}
                      {`공급가액: ${
                        typeof props.selectedQuickRegisterMessage.parsedData?.supplyCost === "number"
                          ? `${props.formatMoney(props.selectedQuickRegisterMessage.parsedData.supplyCost)}원`
                          : "-"
                      }\n`}
                      {`세액: ${
                        typeof props.selectedQuickRegisterMessage.parsedData?.taxTotal === "number"
                          ? `${props.formatMoney(props.selectedQuickRegisterMessage.parsedData.taxTotal)}원`
                          : "-"
                      }`}
                    </span>
                  </div>
                  <div className="quick-register-compare-grid">
                    <div className="quick-register-compare-card">
                      <span>메일 기준</span>
                      <strong>{props.selectedQuickRegisterMessage.parsedData?.plantAddress || props.selectedQuickRegisterMessage.parsedData?.plantName || "-"}</strong>
                      <p>{props.selectedQuickRegisterMessage.parsedData?.billingMonth || "정산월 없음"} · {props.selectedQuickRegisterMessage.fromAddress || "-"}</p>
                    </div>
                    <div className="quick-register-compare-card">
                      <span>등록 후보</span>
                      <strong>{props.quickRegisterForm.corpName || props.quickRegisterForm.customerName || "고객 정보 입력 필요"}</strong>
                      <p>{props.quickRegisterForm.businessNumber || "사업자번호 없음"} · {props.quickRegisterForm.addr || "주소 없음"}</p>
                    </div>
                  </div>
                  {canQuickRegisterSelectedMessage ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (props.busyKey !== null) return;
                        void props.runAction("quick-register-unmatched", props.submitQuickRegister);
                      }}
                    >
                      <div className="customer-form-lead quick-register-lead">
                        <strong>자동 매칭에서 빠진 값만 확인하면 됩니다.</strong>
                        <span>대표자명, 주소, 사업자번호, 세금계산서 상호만 맞으면 예외 메일도 바로 등록할 수 있습니다.</span>
                      </div>
                      <div className="form-grid quick-register-grid">
                        <label>
                          대표자명
                          <input
                            value={props.quickRegisterForm.customerName}
                            onChange={(event) => props.setQuickRegisterForm((prev) => ({ ...prev, customerName: event.target.value }))}
                          />
                        </label>
                        <label>
                          주소
                          <input
                            value={props.quickRegisterForm.addr}
                            onChange={(event) => props.setQuickRegisterForm((prev) => ({ ...prev, addr: event.target.value }))}
                          />
                          <span className="field-hint">메일에서 읽은 주소가 먼저 들어가 있으며 비어 있으면 직접 입력하면 됩니다.</span>
                        </label>
                        <label>
                          사업자번호
                          <input
                            value={props.quickRegisterForm.businessNumber}
                            onChange={(event) => props.setQuickRegisterForm((prev) => ({ ...prev, businessNumber: event.target.value }))}
                          />
                        </label>
                        <label>
                          세금계산서 상호
                          <input
                            value={props.quickRegisterForm.corpName}
                            onChange={(event) => props.setQuickRegisterForm((prev) => ({ ...prev, corpName: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="button-row quick-register-actions">
                        <button type="submit" disabled={props.busyKey !== null}>
                          {props.isQuickRegistering ? "처리 중..." : "예외 고객 등록 후 메일 연결"}
                        </button>
                        {props.isQuickRegistering ? <span className="field-hint">고객 등록과 메일 연결을 처리하고 있습니다.</span> : null}
                      </div>
                    </form>
                  ) : (
                    <div className="helper-box import-helper-box">
                      <strong>
                        {selectedExceptionStatus === "duplicate" ? "중복 의심 메일입니다." : "재처리로 먼저 확인하세요."}
                      </strong>
                      <span className="helper-multiline-text helper-multiline-scroll">
                        {props.selectedQuickRegisterMessage.parseError
                          ? `오류: ${props.selectedQuickRegisterMessage.parseError}\n`
                          : ""}
                        {selectedExceptionStatus === "failed"
                          ? "파싱에 실패한 메일입니다. 파서 보정이나 원본 메일 확인 뒤 다시 처리하는 흐름에 가깝습니다."
                          : selectedExceptionStatus === "duplicate"
                            ? "이미 처리된 메일인지, 완료 처리된 정산월인지, 중복 수신인지 먼저 확인하세요."
                            : "자동 매칭만으로 고객을 찾지 못했습니다. 고객 정보 보완이 어렵다면 재처리로 최신 상태를 다시 확인하세요."}
                      </span>
                      <div className="button-row quick-register-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={props.busyKey !== null}
                          onClick={() =>
                            void props.runAction(
                              `reprocess-exception-${props.selectedQuickRegisterMessage?.id ?? "unknown"}`,
                              () => props.onReprocessInboxMessage(props.selectedQuickRegisterMessage!.id)
                            )
                          }
                        >
                          다시 처리
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty">왼쪽에서 예외 메일을 선택하세요.</div>
              )}
            </Panel>
          </div>
        </>
      )}

      {props.mode === "exceptions" && props.quickRegisterNotice ? <div className="alert success">{props.quickRegisterNotice}</div> : null}
      {props.mode === "exceptions" && props.quickRegisterError ? <div className="alert error import-error-box">{props.quickRegisterError}</div> : null}

      {showBillingMonthCompletion && props.billingMonthSummaries.length > 0 ? (
        hasExceptionMessages ? (
          <Panel
            className="panel-initial-months"
            title={`월별 완료 처리 ${props.billingMonthSummaries.length}개`}
            subtitle="이미 발행이 끝난 정산월은 완료 처리해 두면 이후 메일을 다시 올리지 않습니다."
          >
            {billingMonthCompletionList}
          </Panel>
        ) : (
          <details className="onboarding-advanced-details">
            <summary>{`월별 완료 처리 ${props.billingMonthSummaries.length}개 보기`}</summary>
            <div className="helper-box-stack">
              <strong>예외 메일이 없을 때만 필요하면 열어 확인하세요.</strong>
              <span>이미 발행이 끝난 정산월은 완료 처리해 두면 이후 메일을 다시 올리지 않습니다.</span>
              {billingMonthCompletionList}
            </div>
          </details>
        )
      ) : null}

      {showBillingMonthCompletion && props.completedBillingNotice ? <div className="alert success">{props.completedBillingNotice}</div> : null}
    </div>
  );
}
