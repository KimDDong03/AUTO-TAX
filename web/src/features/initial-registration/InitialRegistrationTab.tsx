import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  LoaderCircle,
  type LucideIcon
} from "lucide-react";
import {
  InlineNotice,
  TaskProgressStrip,
  StatusBadge,
  type ConsoleTone
} from "@/components/console";
import { Panel, PasswordField } from "../../components/ui";
import type { BootstrapPayload } from "../../types";
import type {
  CustomerOnboardingPreviewResponse,
  CustomerOnboardingTemplateWorkbookInput
} from "./customer-onboarding-workbook";
import type { ElectronicTaxOnboardingCertificateRegistrationProgress } from "./electronic-tax-onboarding-orchestration";
import {
  buildInitialRegistrationCandidateReviewState,
  type InitialRegistrationCandidateReview,
  type InitialRegistrationReviewIssue
} from "./initial-registration-review-model";

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
  certificateRegistrationRunning: boolean;
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

type CustomerOnboardingChecklistPlantRow = CustomerOnboardingTemplateWorkbookInput["plants"][number];

export type InitialRegistrationJoinProgress = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  status: "running" | "complete";
};

export function getInitialRegistrationChecklistSelectionPatch(
  rows: CustomerOnboardingChecklistPlantRow[],
  input: {
    rowIndex: number;
    selected: boolean;
    anchorRowIndex: number | null;
    shiftKey: boolean;
  }
): { rowIndexes: number[]; selected: boolean } {
  if (!input.shiftKey || input.anchorRowIndex === null) {
    return { rowIndexes: [input.rowIndex], selected: input.selected };
  }

  const targetIndex = rows.findIndex((row) => row.rowIndex === input.rowIndex);
  const anchorIndex = rows.findIndex((row) => row.rowIndex === input.anchorRowIndex);
  if (targetIndex < 0 || anchorIndex < 0) {
    return { rowIndexes: [input.rowIndex], selected: input.selected };
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);
  return {
    rowIndexes: rows.slice(startIndex, endIndex + 1).map((row) => row.rowIndex),
    selected: input.selected
  };
}

type InitialStatusNoticeTone = "info" | "progress" | "success" | "warn" | "danger";

function getInitialStatusNoticeIcon(tone: InitialStatusNoticeTone): LucideIcon {
  if (tone === "progress") return LoaderCircle;
  if (tone === "success") return CheckCircle2;
  if (tone === "warn" || tone === "danger") return AlertTriangle;
  return Bell;
}

function getInitialStatusNoticeTone(tone: InitialStatusNoticeTone): ConsoleTone {
  if (tone === "progress" || tone === "info") return "info";
  if (tone === "success") return "success";
  if (tone === "warn") return "warning";
  return "danger";
}

function InitialStatusNotice(props: {
  title: string;
  message: string;
  tone?: InitialStatusNoticeTone;
}) {
  const tone = props.tone ?? "info";
  return (
    <InlineNotice
      title={props.title}
      tone={getInitialStatusNoticeTone(tone)}
      icon={getInitialStatusNoticeIcon(tone)}
      className={`initial-status-notice initial-status-notice-${tone}`}
    >
      <span className="helper-multiline-text helper-multiline-scroll">
        {props.message}
      </span>
    </InlineNotice>
  );
}

export function buildInitialRegistrationReviewMessages(input: {
  preview: CustomerOnboardingPreviewResponse | null;
  error: string;
}): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  const pushMessage = (message: string) => {
    const normalized = message.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    messages.push(message.trim());
  };

  for (const message of input.error.split(/\r?\n/)) {
    pushMessage(message);
  }

  for (const row of input.preview?.rows ?? []) {
    if (
      row.status !== "blocked" &&
      row.errors.length === 0 &&
      row.warnings.length === 0
    ) {
      continue;
    }

    const rowLabel =
      row.corpName.trim() ||
      row.customerName.trim() ||
      row.businessNumber.trim() ||
      `${row.rowIndex}행`;
    for (const error of row.errors) {
      pushMessage(`${rowLabel}: ${error}`);
    }
    for (const warning of row.warnings) {
      pushMessage(`${rowLabel}: ${warning}`);
    }
  }

  return messages;
}

function InitialRegistrationReviewIssues(props: {
  messages: string[];
  blockedCount: number;
}) {
  if (props.messages.length === 0) {
    return null;
  }
  const title = props.blockedCount > 0
    ? `확인 필요 ${props.messages.length}건`
    : `보완 안내 ${props.messages.length}건`;

  return (
    <div className="initial-registration-review-issues" role="alert">
      <div className="initial-registration-review-issues-head">
        <AlertTriangle aria-hidden="true" />
        <strong>{title}</strong>
      </div>
      <ul>
        {props.messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function InitialRegistrationProgressCard(props: {
  title: string;
  statusText: string;
  current: number;
  total: number;
  progressValue: number;
  metaItems: Array<{ label: string; value: number }>;
}) {
  return (
    <TaskProgressStrip
      className="initial-registration-progress-card"
      title={props.title}
      description={props.statusText}
      current={props.current}
      total={props.total}
      value={props.progressValue}
      meta={props.metaItems.map((item) => ({
        label: item.label,
        value: `${item.value}건`
      }))}
    />
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
      ? "먼저 AT 헬퍼 상태확인을 완료하세요."
    : !downloadCompleted && input.helperReady && !hasElectronicTaxCertificates
      ? "AT 헬퍼 준비에서 공동인증서 읽기를 실행하세요."
        : needsUploadRetry
          ? `검토 ${input.blockedCount}건 수정 후 다시 확인하세요.`
        : stage === "commit" && commitSubmitted && input.certificatePendingJoinCount > 0
          ? `발행 연동 가입 대기 ${input.certificatePendingJoinCount}건`
        : stage === "commit" && commitSubmitted && input.certificateFailedJoinCount > 0
          ? `발행 연동 확인 필요 ${input.certificateFailedJoinCount}건`
        : stage === "certificate" && input.certificatePendingJoinCount > 0
          ? `발행 연동 처리 대기 ${input.certificatePendingJoinCount}건`
          : stage === "certificate" && input.certificateFailedJoinCount > 0
            ? `등록 처리 확인이 필요한 고객 ${input.certificateFailedJoinCount}건이 있습니다.`
              : undefined;
  const certificateFindStepStatus: InitialRegistrationStepStatus = downloadCompleted
    ? "complete"
    : stage === "download"
      ? "current"
      : "locked";
  const reviewStepStatus: InitialRegistrationStepStatus = uploadCompleted
    ? "complete"
    : stage === "upload"
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
      ? "지금 할 일 · 등록 대상 선택"
      : stage === "upload"
        ? needsUploadRetry
          ? "지금 할 일 · 선택 고객 다시 확인"
          : "지금 할 일 · 선택 고객 확인"
        : stage === "commit" || stage === "certificate"
          ? "지금 할 일 · 초기 등록 실행"
          : "지금 할 일 · 공동인증서 등록";
  const description = certificateCompleted
    ? "다음 단계로 이동"
    : stage === "download"
      ? input.helperReady
        ? hasElectronicTaxCertificates
          ? `전자세금용 인증서 ${input.helperCertificateCount}건 기준`
          : "발행 가능 인증서 없음"
        : "AT 헬퍼 필요"
      : stage === "commit"
        ? commitSubmitted && input.certificatePendingJoinCount > 0
          ? `가입 대기 ${input.certificatePendingJoinCount}건`
          : commitSubmitted && input.certificateFailedJoinCount > 0
            ? `확인 필요 ${input.certificateFailedJoinCount}건`
            : `반영/등록 ${input.importableCount}건`
        : stage === "certificate"
          ? input.certificateAutoTargetCount > 0
            ? input.certificateRetryCount > 0 && !input.certificateRegistrationRunning
              ? `확인 필요 ${input.certificateRetryCount}건`
              : `등록 대기 ${input.certificateAutoTargetCount}건`
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
              ? "확인 준비"
              : "대상 선택";
  const primaryActionLabel = certificateCompleted
    ? "등록 완료"
    : stage === "download"
      ? "대상 선택"
      : stage === "commit"
        ? "초기 등록 실행"
        : stage === "certificate"
          ? input.certificateAutoTargetCount > 0
              ? input.certificateRetryCount > 0 && !input.certificateRegistrationRunning
                ? "공동인증서 다시 확인"
                : "공동인증서 등록"
              : input.certificatePendingJoinCount > 0
                ? "발행 연동 다시 확인"
                : input.certificateFailedJoinCount > 0
                  ? "고객 관리에서 확인"
                  : "다음 단계 보기"
          : uploadCompleted || input.hasSelectedFile
            ? "다시 확인"
            : "선택 고객 확인";
  const stepItems: InitialRegistrationStepItem[] = [
    {
      step: 1,
      title: "등록 대상 선택",
      description: downloadCompleted
        ? input.hasSelectedFile
          ? `인증서 ${input.helperCertificateCount}건`
          : "완료"
        : input.helperReady
          ? hasElectronicTaxCertificates
            ? "등록 대상 선택"
            : "헬퍼에서 읽기"
          : "AT 헬퍼 필요",
      status: certificateFindStepStatus,
      ...getInitialRegistrationStepMeta(certificateFindStepStatus)
    },
    {
      step: 2,
      title: "선택 고객 확인",
      description: uploadCompleted
        ? needsUploadRetry
          ? "수정 필요"
          : "완료"
        : downloadCompleted
          ? input.hasSelectedFile
            ? "고객 정보 확인"
            : "인증서 없음"
          : input.helperReady
            ? "인증서 찾기 후 진행"
            : "대기",
      status: reviewStepStatus,
      ...getInitialRegistrationStepMeta(reviewStepStatus)
    },
    {
      step: 3,
      title: "초기 등록 실행",
      description: commitCompleted
        ? "고객 반영 완료"
        : commitSubmitted && input.certificatePendingJoinCount > 0
          ? `가입 대기 ${input.certificatePendingJoinCount}건`
        : commitSubmitted && input.certificateFailedJoinCount > 0
          ? `확인 필요 ${input.certificateFailedJoinCount}건`
        : canCommit
          ? `반영/등록 ${input.importableCount}건`
          : uploadCompleted
            ? "업로드 후 확인"
            : "대기",
      status: commitCompleted ? "complete" : stage === "commit" ? "current" : "locked",
      ...getInitialRegistrationStepMeta(commitCompleted ? "complete" : stage === "commit" ? "current" : "locked")
    },
    {
      step: 4,
      title: "공동인증서 등록",
      description: certificateCompleted
        ? "완료"
        : input.certificateAutoTargetCount > 0
            ? input.certificateRetryCount > 0 && !input.certificateRegistrationRunning
              ? `확인 필요 ${input.certificateRetryCount}건`
              : `등록 대기 ${input.certificateAutoTargetCount}건`
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

function InitialRegistrationCandidateReviewDetail(props: {
  row: CustomerOnboardingChecklistPlantRow;
  review: InitialRegistrationCandidateReview;
  busy: boolean;
  onChange: (
    rowIndex: number,
    patch: Partial<CustomerOnboardingChecklistPlantRow>
  ) => void;
}) {
  const needsManualInfo = props.review.issues.some((issue) => issue.needsManualInfo);
  const needsPassword = props.review.issues.some((issue) => issue.needsPassword);
  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  const updateField = (
    key: "businessNumber" | "customerName" | "corpName" | "addr",
    value: string
  ) => {
    props.onChange(props.row.rowIndex, { [key]: value });
  };

  return (
    <tr className="initial-onboarding-review-detail-row">
      <td colSpan={4}>
        <div className="initial-onboarding-review-detail">
          <div className="initial-onboarding-review-issue-list">
            {props.review.issues.map((issue: InitialRegistrationReviewIssue) => (
              <div key={`${issue.code}:${issue.message}`} className="initial-onboarding-review-issue">
                <strong>{issue.message}</strong>
                <span>{issue.action}</span>
              </div>
            ))}
          </div>
          {needsPassword ? (
            <p className="initial-onboarding-review-detail-hint">
              공통 비밀번호와 다르면 이 행의 개별 비밀번호 칸에 실제 비밀번호를 입력하세요.
            </p>
          ) : null}
          {needsManualInfo ? (
            <div className="initial-onboarding-manual-grid" onClick={stopPropagation}>
              <label>
                사업자번호
                <input
                  value={props.row.businessNumber ?? ""}
                  disabled={props.busy}
                  inputMode="numeric"
                  onChange={(event) => updateField("businessNumber", event.target.value)}
                  placeholder="숫자 10자리"
                />
              </label>
              <label>
                상호명
                <input
                  value={props.row.corpName ?? ""}
                  disabled={props.busy}
                  onChange={(event) => updateField("corpName", event.target.value)}
                  placeholder={props.row.plantName || props.row.certificateName || "상호명"}
                />
              </label>
              <label>
                대표자명
                <input
                  value={props.row.customerName ?? ""}
                  disabled={props.busy}
                  onChange={(event) => updateField("customerName", event.target.value)}
                  placeholder="상호명과 같으면 비워도 됩니다"
                />
              </label>
              <label className="initial-onboarding-manual-grid-wide">
                사업장 주소
                <input
                  value={props.row.addr ?? ""}
                  disabled={props.busy}
                  onChange={(event) => updateField("addr", event.target.value)}
                  placeholder="한전 메일 자동 매칭에 사용할 주소"
                />
              </label>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

type InitialRegistrationTabProps = {
  mode: InitialRegistrationTabMode;
  busyKey: string | null;
  customerOnboardingFileName: string;
  customerOnboardingChecklistRows: CustomerOnboardingChecklistPlantRow[];
  customerOnboardingPreview: CustomerOnboardingPreviewResponse | null;
  customerOnboardingConfirmedCertificateCount?: number | null;
  customerOnboardingNotice: string;
  customerOnboardingError: string;
  certificateRegistrationProgress: ElectronicTaxOnboardingCertificateRegistrationProgress | null;
  joinProgress: InitialRegistrationJoinProgress | null;
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
  uploadCertificateFiles: (files: File[]) => Promise<void>;
  reviewCustomerOnboardingChecklist: () => Promise<void>;
  updateCustomerOnboardingChecklistRow: (
    rowIndex: number,
    patch: Partial<CustomerOnboardingChecklistPlantRow>
  ) => void;
  updateCustomerOnboardingChecklistRowsSelection: (rowIndexes: number[], selected: boolean) => void;
  setCustomerOnboardingChecklistSelection: (selected: boolean) => void;
  deleteSelectedCustomerOnboardingChecklistRows: () => void;
  proceedOnboardingInitialRegistration: () => Promise<void>;
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
  const certificateFileInputRef = useRef<HTMLInputElement | null>(null);
  const certificateFolderInputRef = useRef<HTMLInputElement | null>(null);
  const checklistSelectAllInputRef = useRef<HTMLInputElement | null>(null);
  const [sharedPasswordVisible, setSharedPasswordVisible] = useState(false);
  const [lastChecklistAnchorRowIndex, setLastChecklistAnchorRowIndex] = useState<number | null>(null);
  const onboardingBusyKey = props.busyKey?.startsWith("customer-onboarding-") ? props.busyKey : null;
  const isPreviewingOnboarding = onboardingBusyKey === "customer-onboarding-preview";
  const isRunningInitialRegistration = onboardingBusyKey === "customer-onboarding-initial-registration";
  const isCommittingOnboarding = onboardingBusyKey === "customer-onboarding-commit" || isRunningInitialRegistration;
  const showBillingMonthCompletion = props.showBillingMonthCompletion ?? props.mode === "exceptions";
  const hasExceptionMessages = props.quickRegisterMessages.length > 0;
  const registrationReady = props.registrationReady ?? false;
  const certificateReady = props.certificateReady ?? false;
  const sharedPasswordReady = props.customerOnboardingSharedPassword.trim() !== "";
  const hasChecklistRows = props.customerOnboardingChecklistRows.length > 0;
  const selectedChecklistRows = props.customerOnboardingChecklistRows.filter((row) => row.selected === true);
  const selectedChecklistCount = selectedChecklistRows.length;
  const allChecklistRowsSelected = hasChecklistRows && selectedChecklistCount === props.customerOnboardingChecklistRows.length;
  const hasPartialChecklistSelection = selectedChecklistCount > 0 && !allChecklistRowsSelected;
  useEffect(() => {
    if (checklistSelectAllInputRef.current) {
      checklistSelectAllInputRef.current.indeterminate = hasPartialChecklistSelection;
    }
  }, [hasPartialChecklistSelection]);
  const reviewResultMismatched =
    props.customerOnboardingPreview !== null &&
    selectedChecklistCount > 0 &&
    props.customerOnboardingConfirmedCertificateCount !== null &&
    props.customerOnboardingConfirmedCertificateCount !== undefined &&
    props.customerOnboardingConfirmedCertificateCount !== selectedChecklistCount;
  const candidateReviewState = buildInitialRegistrationCandidateReviewState({
    rows: props.customerOnboardingChecklistRows,
    preview: props.customerOnboardingPreview,
    error: props.customerOnboardingError,
    passwordFailureEntries: props.certificatePasswordOverrideEntries,
    checking: isPreviewingOnboarding
  });
  const reviewIssueMessages = reviewResultMismatched
    ? [
        ...candidateReviewState.unmatchedMessages,
        `선택한 인증서 ${selectedChecklistCount}건과 마지막 확인된 인증서 ${props.customerOnboardingConfirmedCertificateCount ?? 0}건이 일치하지 않습니다. 다시 확인하세요.`
      ]
    : candidateReviewState.unmatchedMessages;
  const onboardingBlockedCount = candidateReviewState.blockingCount + (reviewResultMismatched ? 1 : 0);
  const onboardingImportableCount =
    reviewResultMismatched || candidateReviewState.blockingCount > 0
      ? 0
      : (props.customerOnboardingPreview?.createCount ?? 0) + (props.customerOnboardingPreview?.updateCount ?? 0);
  const hasUsableCustomerOnboardingPreview =
    props.customerOnboardingPreview !== null &&
    !reviewResultMismatched &&
    candidateReviewState.blockingCount === 0;
  const registrationFlow = getInitialRegistrationFlowState({
    helperReady: props.helperReady,
    helperCertificateCount: props.helperCertificateCount,
    registrationReady,
    certificateReady,
    certificateAutoTargetCount: props.certificateAutoTargetCount ?? 0,
    certificatePendingJoinCount: props.certificatePendingJoinCount ?? 0,
    certificateFailedJoinCount: props.certificateFailedJoinCount ?? 0,
    certificateRetryCount: props.certificateRetryCount ?? 0,
    certificateRegistrationRunning:
      props.busyKey === "customer-onboarding-cert-registration" || isRunningInitialRegistration,
    templateDownloaded: props.registrationTemplateDownloaded ?? false,
    previewReady: props.registrationPreviewReady ?? Boolean(props.customerOnboardingPreview),
    commitDone: props.registrationCommitDone ?? registrationReady,
    importableCount: onboardingImportableCount,
    blockedCount: onboardingBlockedCount,
    hasSelectedFile: Boolean(props.customerOnboardingFileName)
  });
  const registrationStage = props.registrationStage ?? registrationFlow.stage;
  const isTemplateStage = registrationStage === "download" || registrationStage === "upload";
  const showSharedPasswordField =
    props.mode === "registration" &&
    isTemplateStage;
  const registrationTaskTitle = registrationStage === "download"
    ? "등록 대상 선택"
    : registrationStage === "upload"
      ? "선택 고객 확인"
    : registrationStage === "certificate"
      ? "초기 등록 실행"
      : registrationFlow.headline.replace("지금 할 일 · ", "");
  const registrationTaskDescription = registrationStage === "download"
    ? "읽은 공동인증서 중 관리 고객만 선택하세요. 목록에 없으면 인증서를 가져올 수 있습니다."
    : registrationStage === "upload"
      ? "선택한 고객의 사업자정보와 주소를 확인하세요."
    : registrationFlow.description;
  const selectedRegistrationTaskTitle = registrationStage === "commit" ? "초기 등록 실행" : registrationTaskTitle;
  const selectedRegistrationTaskDescription = registrationStage === "commit"
    ? registrationFlow.commitCompleted
      ? "고객 등록과 발행 연동이 완료되었습니다."
      : "선택한 고객을 반영한 뒤 공동인증서 등록까지 이어서 진행합니다."
    : registrationStage === "certificate"
      ? registrationFlow.description
    : registrationStage === "upload"
      ? "선택한 고객의 사업자정보와 주소를 확인하세요."
    : registrationTaskDescription;
  const checklistPasswordReady =
    sharedPasswordReady ||
    (selectedChecklistCount > 0 &&
      selectedChecklistRows.every((row) => (row.certificatePassword ?? "").trim() !== ""));
  const canReviewChecklist = props.helperReady && selectedChecklistCount > 0 && checklistPasswordReady;
  const reviewBlockedTitle = !props.helperReady
    ? "먼저 AT 헬퍼 상태확인을 완료하세요."
    : !hasChecklistRows
    ? "AT 헬퍼 준비에서 공동인증서 읽기를 먼저 실행하세요."
    : selectedChecklistCount === 0
    ? "등록할 고객의 공동인증서를 선택하세요."
    : !checklistPasswordReady
      ? "선택한 행에 공통 비밀번호를 입력하거나 각 행의 개별 비밀번호를 입력하세요."
    : undefined;
  const downloadBlockedTitle = !props.helperReady
    ? "먼저 AT 헬퍼 상태확인을 완료하세요."
    : undefined;
  const applyChecklistRowSelection = (
    row: CustomerOnboardingChecklistPlantRow,
    selected: boolean,
    event: { shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean }
  ) => {
    if (event.shiftKey) {
      window.getSelection()?.removeAllRanges();
    }
    const patch = getInitialRegistrationChecklistSelectionPatch(
      props.customerOnboardingChecklistRows,
      {
        rowIndex: row.rowIndex,
        selected,
        anchorRowIndex: lastChecklistAnchorRowIndex,
        shiftKey: event.shiftKey
      }
    );
    props.updateCustomerOnboardingChecklistRowsSelection(patch.rowIndexes, patch.selected);
    setLastChecklistAnchorRowIndex(row.rowIndex);
  };
  const isChecklistRowInteractiveTarget = (target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest("input, button, a, textarea, select, label, summary"))
    );
  };
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
    props.mode !== "registration" || registrationStage === "done" || isTemplateStage
      ? null
      : (registrationStage === "commit" && !registrationFlow.commitCompleted) || registrationStage === "certificate"
        ? {
            label:
              isCommittingOnboarding || props.busyKey === "customer-onboarding-cert-registration"
                ? "초기 등록 진행 중..."
                : "초기 등록 실행",
            disabled:
              registrationStage === "commit"
                ? props.busyKey !== null || !hasUsableCustomerOnboardingPreview || onboardingImportableCount === 0
                : (props.certificateActionDisabled ?? props.busyKey !== null),
            title: registrationStage === "certificate" ? props.certificateActionTitle : undefined,
            onClick: () =>
              void props.runAction(
                "customer-onboarding-initial-registration",
                props.proceedOnboardingInitialRegistration,
                { reload: false }
              )
          }
        : null;
  const showTemplateActions = shouldShowInitialRegistrationTemplateActions({
    mode: props.mode,
    registrationStage,
    uploadCompleted: registrationFlow.uploadCompleted,
    templateStepSelected: isTemplateStage
  });
  const showCertificateSourceActions = props.mode === "registration" && registrationStage !== "done";
  const hasActiveRegistrationProgress = Boolean(
    props.certificateRegistrationProgress || props.joinProgress || isRunningInitialRegistration
  );
  const showChecklistWorkspace =
    props.mode === "registration" &&
    (hasChecklistRows || isTemplateStage) &&
    registrationStage !== "done" &&
    !hasActiveRegistrationProgress;
  const certificateProgress = props.certificateRegistrationProgress;
  const certificateProgressSettled = Boolean(
    certificateProgress &&
      (
        certificateProgress.status === "failed" ||
        certificateProgress.status === "success" ||
        certificateProgress.status === "already-registered"
      )
  );
  const uploadProgressMessage = isPreviewingOnboarding
    ? props.customerOnboardingNotice || "초기 등록 대상을 점검하는 중입니다..."
    : "";
  const showCustomerOnboardingNotice =
    Boolean(props.customerOnboardingNotice) &&
    !showChecklistWorkspace &&
    !registrationFlow.blockedReason &&
    !uploadProgressMessage &&
    (!certificateProgress || certificateProgressSettled) &&
    !props.joinProgress;
  const certificateProgressPercent =
    certificateProgress && certificateProgress.total > 0
      ? Math.round((certificateProgress.current / certificateProgress.total) * 100)
      : 0;
  const certificateProgressStatusText =
    certificateProgress?.status === "failed"
      ? `확인 필요 ${certificateProgress.failed}건`
      : certificateProgress?.status === "success" || certificateProgress?.status === "already-registered"
        ? "완료"
        : certificateProgress?.status === "refreshing"
          ? "상태 확인 중"
          : certificateProgress?.currentCustomerName
            ? `${certificateProgress.currentCustomerName} 처리 중`
            : "처리 중";
  const joinProgress = props.joinProgress;
  const activeRegistrationProgress = certificateProgress
    ? {
        title: "공동인증서 등록 현황",
        statusText: certificateProgressStatusText,
        current: certificateProgress.current,
        total: certificateProgress.total,
        progressValue: certificateProgressPercent,
        metaItems: [
          { label: "완료", value: certificateProgress.completed + certificateProgress.alreadyRegistered },
          { label: "실패", value: certificateProgress.failed }
        ]
      }
    : joinProgress
      ? {
          title: "발행 연동 준비 현황",
          statusText: joinProgress.status === "complete"
            ? "완료"
            : joinProgress.failed
              ? `확인 필요 ${joinProgress.failed}건`
              : "진행 중",
          current: joinProgress.completed,
          total: joinProgress.total,
          progressValue: joinProgress.total > 0
            ? Math.round((joinProgress.completed / joinProgress.total) * 100)
            : 0,
          metaItems: [
            { label: "완료", value: joinProgress.completed },
            { label: "실패", value: joinProgress.failed }
          ]
        }
    : isRunningInitialRegistration
      ? {
          title: "초기 등록 실행 현황",
          statusText: "고객 반영 중",
          current: 0,
          total: Math.max(onboardingImportableCount, selectedChecklistCount, 1),
          progressValue: 0,
          metaItems: [
            { label: "선택", value: selectedChecklistCount },
            { label: "반영", value: 0 }
          ]
        }
    : null;
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
  const directoryInputProps = {
    type: "file",
    multiple: true,
    directory: "",
    webkitdirectory: "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      if (files.length > 0) {
        void props.runAction(
          "customer-onboarding-certificate-upload",
          async () => props.uploadCertificateFiles(files),
          { reload: false }
        );
      }
    }
  } as React.InputHTMLAttributes<HTMLInputElement> & {
    directory: string;
    webkitdirectory: string;
  };
  const handleCertificateFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) {
      void props.runAction(
        "customer-onboarding-certificate-upload",
        async () => props.uploadCertificateFiles(files),
        { reload: false }
      );
    }
  };
  const sharedPasswordControl = showSharedPasswordField ? (
    <label className="initial-registration-shared-password">
      <span>공통 비밀번호</span>
      <PasswordField
        visible={sharedPasswordVisible}
        onVisibleChange={setSharedPasswordVisible}
        value={props.customerOnboardingSharedPassword}
        disabled={props.busyKey !== null}
        onChange={(event) =>
          props.onCustomerOnboardingSharedPasswordChange(event.target.value)
        }
        placeholder="선택한 고객에 공통 적용"
        revealLabel="공통 비밀번호 보기"
        hideLabel="공통 비밀번호 숨기기"
      />
    </label>
  ) : null;
  const reviewChecklistLabel = isPreviewingOnboarding
    ? "확인 중..."
    : registrationFlow.uploadCompleted || candidateReviewState.issueCount > 0
      ? "수정 후 다시 확인"
      : "선택 고객 확인";
  const reviewChecklistButton = showTemplateActions ? (
    <Button
      type="button"
      size="sm"
      className="initial-registration-review-button"
      disabled={props.busyKey !== null || !canReviewChecklist}
      title={reviewBlockedTitle}
      onClick={() =>
        void props.runAction(
          "customer-onboarding-preview",
          props.reviewCustomerOnboardingChecklist,
          { reload: false }
        )
      }
    >
      {reviewChecklistLabel}
    </Button>
  ) : null;
  const primaryRegistrationButton = registrationPrimaryAction ? (
    <Button
      type="button"
      size="sm"
      className="initial-registration-review-button"
      disabled={registrationPrimaryAction.disabled}
      title={registrationPrimaryAction.title}
      onClick={registrationPrimaryAction.onClick}
    >
      {registrationPrimaryAction.label}
    </Button>
  ) : null;
  const manualCertificateRegistration = showCertificateSourceActions ? (
    <details className="initial-registration-manual-source">
      <summary>목록에 없는 인증서 추가</summary>
      <div className="initial-registration-manual-source-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busyKey !== null || !props.helperReady}
          title={downloadBlockedTitle}
          onClick={() => certificateFileInputRef.current?.click()}
        >
          파일 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busyKey !== null || !props.helperReady}
          title={downloadBlockedTitle}
          onClick={() => certificateFolderInputRef.current?.click()}
        >
          폴더 추가
        </Button>
      </div>
    </details>
  ) : null;
  const checklistWorkspaceTitle =
    registrationStage === "certificate"
      ? "초기 등록 실행"
      : registrationStage === "commit"
        ? "초기 등록 실행"
        : registrationStage === "upload"
          ? "선택 고객 확인"
        : "등록 대상 선택";
  const checklistWorkspaceSummary = hasChecklistRows
    ? [
        `등록 대상 ${props.customerOnboardingChecklistRows.length}건`,
        `선택 ${selectedChecklistCount}건`,
        candidateReviewState.readyCount > 0 ? `통과 ${candidateReviewState.readyCount}건` : null,
        candidateReviewState.blockingCount > 0 ? `수정 필요 ${candidateReviewState.blockingCount}건` : null
      ].filter(Boolean).join(" · ")
    : "등록 대상 없음";
  const checklistToolbarAction = reviewChecklistButton ?? primaryRegistrationButton;
  const checklistSelectionActions = hasChecklistRows ? (
    <div className="initial-onboarding-review-actions">
      <button
        type="button"
        className="btn-secondary initial-onboarding-review-delete"
        disabled={props.busyKey !== null || selectedChecklistCount === 0}
        onClick={props.deleteSelectedCustomerOnboardingChecklistRows}
      >
        선택 삭제
      </button>
    </div>
  ) : null;
  const checklistTable = hasChecklistRows ? (
    <div className="initial-registration-candidate-table-shell initial-onboarding-review-table-wrap">
      <table className="initial-onboarding-review-table">
        <thead>
          <tr>
            <th>
              <input
                ref={checklistSelectAllInputRef}
                className="initial-onboarding-review-check initial-onboarding-review-check-all"
                type="checkbox"
                checked={allChecklistRowsSelected}
                disabled={props.busyKey !== null || !hasChecklistRows}
                aria-label={allChecklistRowsSelected ? "등록 대상 전체 해제" : "등록 대상 전체 선택"}
                onClick={(event) => event.stopPropagation()}
                onChange={() => props.setCustomerOnboardingChecklistSelection(!allChecklistRowsSelected)}
              />
            </th>
            <th>상호명</th>
            <th>개별 비밀번호</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {props.customerOnboardingChecklistRows.map((row) => {
            const rowSelected = row.selected === true;
            const review = candidateReviewState.byRowIndex.get(row.rowIndex);
            const statusClassName = review ? `status-${review.status}` : "";
            const hasReviewIssues = Boolean(review && review.issues.length > 0);
            return (
              <React.Fragment key={`${row.rowIndex}:${row.certificateIndex}:${row.certificateName}`}>
                <tr
                  className={[
                    rowSelected ? "is-selected" : "",
                    hasReviewIssues ? "has-review-issues" : "",
                    statusClassName
                  ].filter(Boolean).join(" ") || undefined}
                  aria-selected={rowSelected}
                  onMouseDown={(event) => {
                    if (props.busyKey !== null || isChecklistRowInteractiveTarget(event.target)) {
                      return;
                    }
                    if (event.shiftKey) {
                      event.preventDefault();
                      window.getSelection()?.removeAllRanges();
                    }
                  }}
                  onClick={(event) => {
                    if (props.busyKey !== null || isChecklistRowInteractiveTarget(event.target)) {
                      return;
                    }
                    applyChecklistRowSelection(row, !rowSelected, event);
                  }}
                >
                  <td>
                    <input
                      className="initial-onboarding-review-check"
                      type="checkbox"
                      checked={rowSelected}
                      disabled={props.busyKey !== null}
                      aria-label={`${row.corpName || row.plantName || row.certificateName || "공동인증서"} 등록 대상 선택`}
                      onClick={(event) => {
                        event.stopPropagation();
                        applyChecklistRowSelection(row, event.currentTarget.checked, event);
                      }}
                      onChange={() => undefined}
                    />
                  </td>
                  <td>
                    <span className="initial-onboarding-review-readonly">
                      {row.corpName || row.plantName || "-"}
                    </span>
                  </td>
                  <td>
                    <input
                      className={[
                        "initial-onboarding-review-password",
                        review?.issues.some((issue) => issue.needsPassword) ? "has-error" : ""
                      ].filter(Boolean).join(" ")}
                      type="password"
                      value={row.certificatePassword ?? ""}
                      disabled={props.busyKey !== null || !rowSelected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        props.updateCustomerOnboardingChecklistRow(row.rowIndex, {
                          certificatePassword: event.target.value
                        })
                      }
                      placeholder="공통 비밀번호 사용"
                    />
                  </td>
                  <td>
                    <span className={`initial-onboarding-row-status ${statusClassName}`}>
                      {review?.statusLabel ?? (rowSelected ? "확인 전" : "제외")}
                    </span>
                  </td>
                </tr>
                {hasReviewIssues && review ? (
                  <InitialRegistrationCandidateReviewDetail
                    row={row}
                    review={review}
                    busy={props.busyKey !== null}
                    onChange={props.updateCustomerOnboardingChecklistRow}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;
  const candidateEmptyState = !hasChecklistRows ? (
    <div className="initial-registration-candidate-empty">
      <strong>등록 후보가 없습니다.</strong>
      <span>
        AT 헬퍼 준비에서 공동인증서 읽기를 실행하면 발행 가능 인증서가 여기에 표시됩니다.
      </span>
    </div>
  ) : null;
  const candidateWorkspace = (
    <>
      <div className="initial-registration-candidate-head">
        <div className="initial-registration-candidate-title">
          <strong>{checklistWorkspaceTitle}</strong>
          <span>{checklistWorkspaceSummary}</span>
        </div>
        {checklistSelectionActions}
      </div>
      <div className="initial-registration-candidate-toolbar">
        {sharedPasswordControl}
        {checklistToolbarAction}
      </div>
      {uploadProgressMessage ? (
        <InitialStatusNotice title="진행 중" message={uploadProgressMessage} tone="progress" />
      ) : null}
      {checklistTable}
      {candidateEmptyState}
      <InitialRegistrationReviewIssues messages={reviewIssueMessages} blockedCount={onboardingBlockedCount} />
      {manualCertificateRegistration}
    </>
  );

  return (
    <div className="initial-screen">
      {props.mode === "registration" ? (
        <>
          <input
            ref={certificateFileInputRef}
            type="file"
            accept=".der,.key,.p12,.pfx"
            multiple
            hidden
            aria-label="공동인증서 파일 선택"
            onChange={handleCertificateFileInputChange}
          />
          <input
            {...directoryInputProps}
            ref={certificateFolderInputRef}
            hidden
            aria-label="공동인증서 폴더 선택"
          />
          <section
            className={[
              "onboarding-main-card",
              "panel-initial-onboarding",
              showChecklistWorkspace ? "is-candidate-workspace" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            data-stage={registrationStage}
          >
            {showChecklistWorkspace ? (
              candidateWorkspace
            ) : (
              <>
                <div className="onboarding-main-head">
                  <div className="onboarding-main-copy onboarding-main-copy-focal">
                    <strong>{selectedRegistrationTaskTitle}</strong>
                    <p>{selectedRegistrationTaskDescription}</p>
                    {activeRegistrationProgress ? (
                      <InitialRegistrationProgressCard
                        title={activeRegistrationProgress.title}
                        statusText={activeRegistrationProgress.statusText}
                        current={activeRegistrationProgress.current}
                        total={activeRegistrationProgress.total}
                        progressValue={activeRegistrationProgress.progressValue}
                        metaItems={activeRegistrationProgress.metaItems}
                      />
                    ) : null}
                    <div className="initial-registration-work-row">
                      <div className="initial-registration-action-stack">
                        {sharedPasswordControl}
                        {showTemplateActions ? (
                          <div className="initial-registration-command-panel">
                            {manualCertificateRegistration}
                            {reviewChecklistButton}
                          </div>
                        ) : null}
                        {primaryRegistrationButton ? (
                          <div className="button-row onboarding-primary-row onboarding-primary-row-focal">
                            {primaryRegistrationButton}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {uploadProgressMessage ? (
            showChecklistWorkspace ? null : (
              <InitialStatusNotice title="진행 중" message={uploadProgressMessage} tone="progress" />
            )
          ) : null}

          {showCustomerOnboardingNotice ? (
            <InitialStatusNotice title="안내" message={props.customerOnboardingNotice} tone={registrationFlow.commitCompleted ? "success" : "info"} />
          ) : null}
          {props.customerOnboardingError && reviewIssueMessages.length === 0 && candidateReviewState.issueCount === 0 ? (
            <InitialStatusNotice title="확인 필요" message={props.customerOnboardingError} tone="danger" />
          ) : null}
          {props.customerOnboardingPreview?.fileErrors.length ? (
            <InitialStatusNotice title="시트 연결 오류" message={props.customerOnboardingPreview.fileErrors.join("\n")} tone="warn" />
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
                        <StatusBadge tone={messageStatus === "failed" ? "danger" : messageStatus === "unmatched" ? "warning" : "info"}>
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
