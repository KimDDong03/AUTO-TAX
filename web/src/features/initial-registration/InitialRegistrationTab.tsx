import { useRef } from "react";
import type React from "react";
import { Panel } from "../../components/ui";
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
type InitialRegistrationTabMode = "registration" | "exceptions";
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
  chipClass: string;
};

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
    return { statusLabel: "완료", chipClass: "chip chip-success" };
  }

  if (status === "current") {
    return { statusLabel: "지금", chipClass: "chip chip-warn" };
  }

  return { statusLabel: "대기", chipClass: "chip" };
}

export function getInitialRegistrationFlowState(input: InitialRegistrationFlowStateInput): InitialRegistrationFlowState {
  const commitCompleted = input.commitDone || input.registrationReady;
  const uploadCompleted = input.previewReady || commitCompleted;
  const downloadCompleted = input.templateDownloaded || uploadCompleted;
  const certificateCompleted = commitCompleted && input.certificateReady;
  const canCommit = input.importableCount > 0;
  const needsUploadRetry = uploadCompleted && !commitCompleted && !canCommit;
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
          : stage === "certificate" && input.certificatePendingJoinCount > 0
            ? `팝빌 가입 ${input.certificatePendingJoinCount}건이 진행 중입니다. 가입이 끝나면 전자세금용 등록을 자동으로 이어서 처리합니다.`
            : stage === "certificate" && input.certificateFailedJoinCount > 0
              ? `팝빌 가입 확인이 필요한 고객 ${input.certificateFailedJoinCount}건이 있습니다.`
              : undefined;
  const uploadStepStatus: InitialRegistrationStepStatus = needsUploadRetry
    ? "current"
    : uploadCompleted
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
      ? "지금 할 일 · 양식 다운로드"
      : stage === "upload"
        ? needsUploadRetry
          ? "지금 할 일 · 다시 업로드"
          : "지금 할 일 · 양식 업로드"
        : stage === "commit"
          ? "지금 할 일 · 고객 반영"
          : "지금 할 일 · 팝빌 전자세금용 등록";
  const description = certificateCompleted
    ? "다음 단계로 이동"
    : stage === "download"
      ? input.helperReady
        ? hasElectronicTaxCertificates
          ? `전자세금용 인증서 ${input.helperCertificateCount}건 기준`
          : "전자세금용 없음"
        : "헬퍼 필요"
      : stage === "commit"
        ? `반영 ${input.importableCount}건`
        : stage === "certificate"
          ? input.certificateAutoTargetCount > 0 && input.certificateRetryCount > 0
            ? `전자세금용 등록 다시 시도 ${input.certificateRetryCount}건`
            : input.certificateAutoTargetCount > 0
              ? `전자세금용 자동 등록 ${input.certificateAutoTargetCount}건`
              : input.certificatePendingJoinCount > 0
                ? `팝빌 가입 대기 ${input.certificatePendingJoinCount}건`
                : input.certificateFailedJoinCount > 0
                  ? `팝빌 가입 확인 필요 ${input.certificateFailedJoinCount}건`
                  : certificatePendingCount > 0
                    ? `추가 확인 ${certificatePendingCount}건`
                    : "마무리 확인"
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
            ? "전자세금용 등록 다시 시도"
            : input.certificateAutoTargetCount > 0
              ? "전자세금용 등록 마무리"
              : input.certificatePendingJoinCount > 0
                ? "팝빌 가입 완료 대기"
                : input.certificateFailedJoinCount > 0
                  ? "고객 관리에서 확인"
                  : "다음 단계 보기"
          : uploadCompleted || input.hasSelectedFile
            ? "다시 업로드"
            : "양식 업로드";
  const stepItems: InitialRegistrationStepItem[] = [
    {
      step: 1,
      title: "양식 받기",
      description: downloadCompleted
        ? "완료"
        : input.helperReady
          ? hasElectronicTaxCertificates
            ? "전자세금 기준"
            : "전자세금용 없음"
          : "헬퍼 필요",
      status: downloadCompleted ? "complete" : stage === "download" ? "current" : "locked",
      ...getInitialRegistrationStepMeta(downloadCompleted ? "complete" : stage === "download" ? "current" : "locked")
    },
    {
      step: 2,
      title: "양식 올리기",
      description: uploadCompleted
        ? needsUploadRetry
          ? "재업로드"
          : "완료"
        : input.hasSelectedFile
          ? "선택됨"
          : "업로드",
      status: uploadStepStatus,
      ...getInitialRegistrationStepMeta(uploadStepStatus)
    },
    {
      step: 3,
      title: "고객 반영",
      description: commitCompleted
        ? "완료"
        : canCommit
          ? `반영 ${input.importableCount}건`
          : uploadCompleted
            ? "업로드 후 확인"
            : "대기",
      status: commitCompleted ? "complete" : stage === "commit" ? "current" : "locked",
      ...getInitialRegistrationStepMeta(commitCompleted ? "complete" : stage === "commit" ? "current" : "locked")
    },
    {
      step: 4,
      title: "팝빌 전자세금용 등록",
      description: certificateCompleted
        ? "완료"
        : input.certificateAutoTargetCount > 0 && input.certificateRetryCount > 0
          ? `재시도 ${input.certificateRetryCount}건`
          : input.certificateAutoTargetCount > 0
            ? `자동 등록 ${input.certificateAutoTargetCount}건`
            : input.certificatePendingJoinCount > 0
              ? `팝빌 가입 대기 ${input.certificatePendingJoinCount}건`
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
  showBillingMonthCompletion?: boolean;
  downloadCustomerOnboardingTemplate: () => Promise<void>;
  handleCustomerOnboardingFileChange: (file: File | null) => Promise<void>;
  commitCustomerOnboardingWorkbook: () => Promise<void>;
  proceedOnboardingCertificateFollowUp: () => void;
  setQuickRegisterForm: React.Dispatch<React.SetStateAction<QuickRegisterFormState>>;
  selectQuickRegisterMessage: (messageId: number) => void;
  submitQuickRegister: () => Promise<void>;
  markBillingMonthCompleted: (summary: BillingMonthSummary) => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatDateTime: (value: string | null) => string;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
};

export function InitialRegistrationTab(props: InitialRegistrationTabProps) {
  const onboardingFileInputRef = useRef<HTMLInputElement | null>(null);
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
              <span className="status status-ignored">완료 처리</span>
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
    props.mode !== "registration" || registrationStage === "done"
      ? null
      : registrationStage === "download"
        ? {
            label: isDownloadingOnboardingTemplate ? "다운로드 중..." : "양식 다운로드",
            disabled: props.busyKey !== null || !props.helperReady || props.helperCertificateCount === 0,
            title: !props.helperReady
              ? "먼저 로컬 헬퍼 준비 단계에서 전자세금용 공동인증서 읽기 상태를 확인하세요."
              : props.helperCertificateCount === 0
                ? "이 PC에서 전자세금용 공동인증서를 먼저 확인하세요."
                : undefined,
            onClick: () =>
              void props.runAction(
                "customer-onboarding-template",
                props.downloadCustomerOnboardingTemplate,
                { reload: false }
              )
          }
        : registrationStage === "upload"
          ? {
              label: isPreviewingOnboarding ? "확인 중..." : registrationFlow.primaryActionLabel,
              disabled: props.busyKey !== null,
              title: undefined,
              onClick: () => onboardingFileInputRef.current?.click()
            }
          : registrationStage === "commit"
            ? {
                label: isCommittingOnboarding ? "반영 중..." : "고객 등록 반영",
                disabled: props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0,
                title: undefined,
                onClick: () =>
                  void props.runAction(
                    "customer-onboarding-commit",
                    props.commitCustomerOnboardingWorkbook,
                    { reload: false }
                  )
              }
            : {
                label:
                  props.busyKey === "customer-onboarding-cert-registration" &&
                  (props.certificateAutoTargetCount ?? 0) > 0
                    ? "전자세금용 등록 마무리 중..."
                    : props.certificatePrimaryActionLabel ?? registrationFlow.primaryActionLabel,
                disabled: props.certificateActionDisabled ?? props.busyKey !== null,
                title: props.certificateActionTitle,
                onClick: () => props.proceedOnboardingCertificateFollowUp()
              };
  const showOnboardingInlineStatus = Boolean(props.customerOnboardingFileName || props.customerOnboardingPreview);

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
                <strong>{registrationFlow.headline}</strong>
                <p>{registrationFlow.description}</p>
                {props.registrationBlockedReason || registrationFlow.blockedReason ? (
                  <p className="onboarding-inline-warning">{props.registrationBlockedReason ?? registrationFlow.blockedReason}</p>
                ) : null}
                {registrationPrimaryAction ? (
                  <div className="button-row onboarding-primary-row onboarding-primary-row-focal">
                    <button
                      type="button"
                      disabled={registrationPrimaryAction.disabled}
                      title={registrationPrimaryAction.title}
                      onClick={registrationPrimaryAction.onClick}
                    >
                      {registrationPrimaryAction.label}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <ol className="onboarding-stage-list">
              {registrationFlow.stepItems.map((item) => (
                <li
                  key={`onboarding-registration-step-${item.step}`}
                  data-status={item.status}
                  className={[
                    "onboarding-stage-item",
                    item.status === "current" ? "is-current" : "",
                    item.status === "complete" ? "is-complete" : "",
                    item.status === "locked" ? "is-locked" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="onboarding-stage-number">{item.step}</span>
                  <div className="onboarding-stage-copy">
                    <div className="initial-onboarding-step-head">
                      <strong>{item.title}</strong>
                      <span className={item.chipClass}>{item.statusLabel}</span>
                    </div>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            {showOnboardingInlineStatus ? (
              <div className="onboarding-inline-status">
                <div>
                  <span>파일</span>
                  <strong>{props.customerOnboardingFileName || "선택됨"}</strong>
                </div>
                <div>
                  <span>반영</span>
                  <strong>{onboardingImportableCount}건</strong>
                </div>
                <div>
                  <span>검토</span>
                  <strong>{onboardingBlockedCount}건</strong>
                </div>
              </div>
            ) : null}
          </section>

          {!registrationFlow.commitCompleted ? (
            <details className="onboarding-advanced-details">
              <summary>보조 작업 보기</summary>
              <div className="helper-box-stack">
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
                          ? "먼저 로컬 헬퍼 준비 단계에서 전자세금용 공동인증서 읽기 상태를 확인하세요."
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

          {props.customerOnboardingNotice ? (
            <div className="helper-box import-helper-box">
              <strong>안내</strong>
              <span className="helper-multiline-text">{props.customerOnboardingNotice}</span>
            </div>
          ) : null}
          {props.pendingOnboardingCertificateRegistrationCount > 0 ||
          (props.certificatePendingJoinCount ?? 0) > 0 ? (
            <div className="helper-box import-helper-box">
              <strong>다음</strong>
              <span className="helper-multiline-text">
                {(props.certificatePendingJoinCount ?? 0) > 0
                  ? `팝빌 가입 대기 ${props.certificatePendingJoinCount ?? 0}건`
                  : ""}
                {(props.certificatePendingJoinCount ?? 0) > 0 &&
                props.pendingOnboardingCertificateRegistrationCount > 0
                  ? "\n"
                  : ""}
                {props.pendingOnboardingCertificateRegistrationCount > 0
                  ? `팝빌 전자세금용 인증서 등록 ${props.pendingOnboardingCertificateRegistrationCount}건`
                  : ""}
              </span>
            </div>
          ) : null}
          {props.customerOnboardingError ? (
            <div className="helper-box import-helper-box">
              <strong>확인 필요</strong>
              <span className="helper-multiline-text">{props.customerOnboardingError}</span>
            </div>
          ) : null}
          {props.customerOnboardingPreview?.fileErrors.length ? (
            <div className="helper-box import-helper-box">
              <strong>시트 연결 오류</strong>
              <span className="helper-multiline-text">{props.customerOnboardingPreview.fileErrors.join("\n")}</span>
            </div>
          ) : null}
          {props.customerOnboardingPreview?.rows.length ? (
            <details className="initial-onboarding-preview-details">
              <summary>
                <span>반영 미리 보기</span>
                <span className="chip">{props.customerOnboardingPreview.rows.length}건</span>
              </summary>
              <div className="ops-list initial-onboarding-preview-list">
                {props.customerOnboardingPreview.rows.map((row) => {
                  const toneClass =
                    row.status === "blocked" ? "chip-danger" : row.status === "update" ? "chip-warn" : "chip-success";
                  const statusLabel = row.status === "blocked" ? "검토 필요" : row.status === "update" ? "기존 고객 갱신" : "신규 등록";

                  return (
                    <article key={`customer-onboarding-${row.rowIndex}-${row.businessNumber}`} className="ops-card">
                      <div className="ops-card-head">
                        <div>
                          <strong>{row.corpName || row.customerName || `고객 ${row.rowIndex}행`}</strong>
                          <span>{row.businessNumber || "-"}</span>
                        </div>
                        <span className={`chip ${toneClass}`}>{statusLabel}</span>
                      </div>
                      <div className="ops-card-meta">
                        <span>발전소 {row.plantCount}건</span>
                        <span>공동인증서 {row.certificateCount}건</span>
                        {row.errors.length > 0 ? <span className="text-danger">{row.errors.join(" ")}</span> : null}
                        {row.warnings.length > 0 ? <span className="text-warn">{row.warnings.join(" ")}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
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
            <span>
              첫 메일 동기화 뒤 자동 매칭에서 남은 주소 예외나 특수 케이스만 여기서 처리합니다.
              메인 onboarding은 고객 등록과 인증서 준비를 먼저 끝낸 뒤 진행하는 것이 좋습니다.
            </span>
          </div>

          <div className="import-layout">
            <Panel
              className="panel-initial-unmatched"
              title={`예외 메일 ${props.quickRegisterMessages.length}건`}
              subtitle="자동 매칭에서 바로 처리하기 어려운 메일만 모아 둔 목록입니다."
            >
              <div className="list initial-unmatched-list">
                {props.quickRegisterMessages.map((message) => {
                  const isSelected = props.quickRegisterForm.messageId === message.id;
                  return (
                    <button
                      key={message.id}
                      type="button"
                      className={isSelected ? "customer-summary selected" : "customer-summary"}
                      onClick={() => props.selectQuickRegisterMessage(message.id)}
                    >
                      <div className="customer-summary-head">
                        <div>
                          <strong>{message.parsedData?.plantAddress || "주소 없음"}</strong>
                          <p>{message.subject}</p>
                        </div>
                        <span className={`status status-${props.getInboxDisplayParseStatus(message)}`}>
                          {props.getParseStatusLabel(props.getInboxDisplayParseStatus(message))}
                        </span>
                      </div>
                      <div className="customer-summary-meta">
                        <span>{message.parsedData?.billingMonth || "-"}</span>
                        <span>{props.formatDateTime(message.receivedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel
              className="panel-initial-quick-register"
              title="선택 메일 예외 처리"
              subtitle="필수 정보 4개만 보완해 고객과 메일을 바로 연결합니다."
            >
              {props.selectedQuickRegisterMessage ? (
                <>
                  <div className="quick-register-selected">
                    <strong>{props.selectedQuickRegisterMessage.subject}</strong>
                    <div className="quick-register-meta">
                      <span>{props.selectedQuickRegisterMessage.parsedData?.billingMonth || "정산월 없음"}</span>
                      <span>{props.selectedQuickRegisterMessage.parsedData?.plantName || "발전소명 없음"}</span>
                      <span>{props.formatDateTime(props.selectedQuickRegisterMessage.receivedAt)}</span>
                    </div>
                  </div>
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
                        <span className="field-hint">메일에서 읽은 주소가 먼저 들어가 있습니다.</span>
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
                      {props.isQuickRegistering ? <span className="field-hint">고객 등록, 팝빌 가입, 메일 연결을 처리하고 있습니다.</span> : null}
                    </div>
                  </form>
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
