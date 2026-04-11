import { useRef, useState } from "react";
import type React from "react";
import { SurfaceButton, SurfaceCard } from "../../components/ui";
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

type InitialRegistrationTabProps = {
  busyKey: string | null;
  customerOnboardingFileName: string;
  customerOnboardingPreview: CustomerOnboardingPreviewResponse | null;
  customerOnboardingNotice: string;
  customerOnboardingError: string;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantCheckedAt: string | null;
  customerRenewalLoadedCertificateCount: number;
  pendingOnboardingCertificateRegistrationCount: number;
  quickRegisterMessages: InboxMessage[];
  quickRegisterForm: QuickRegisterFormState;
  selectedQuickRegisterMessage: InboxMessage | null;
  isQuickRegistering: boolean;
  quickRegisterNotice: string;
  quickRegisterError: string;
  billingMonthSummaries: BillingMonthSummary[];
  completedBillingNotice: string;
  downloadCustomerOnboardingTemplate: () => Promise<void>;
  handleCustomerOnboardingFileChange: (file: File | null) => Promise<void>;
  commitCustomerOnboardingWorkbook: () => Promise<void>;
  proceedOnboardingCertificateRegistration: () => Promise<void>;
  setQuickRegisterForm: React.Dispatch<React.SetStateAction<QuickRegisterFormState>>;
  selectQuickRegisterMessage: (messageId: number) => void;
  submitQuickRegister: () => Promise<void>;
  markBillingMonthCompleted: (summary: BillingMonthSummary) => Promise<void>;
  refreshCustomerRenewalAssistant: () => Promise<void>;
  renewalHelperDownloadUrl: string;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatDateTime: (value: string | null) => string;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
  showMailFollowupSections?: boolean;
  embeddedInOnboarding?: boolean;
};

function getPreviewStatusMeta(status: CustomerOnboardingPreviewResponse["rows"][number]["status"]) {
  if (status === "blocked") {
    return { label: "오류", className: "tone-error" };
  }
  if (status === "update") {
    return { label: "검토", className: "tone-review" };
  }
  return { label: "준비", className: "tone-success" };
}

type InitialRegistrationFollowupSectionsProps = Pick<
  InitialRegistrationTabProps,
  | "busyKey"
  | "quickRegisterMessages"
  | "quickRegisterForm"
  | "selectedQuickRegisterMessage"
  | "isQuickRegistering"
  | "quickRegisterNotice"
  | "quickRegisterError"
  | "billingMonthSummaries"
  | "completedBillingNotice"
  | "setQuickRegisterForm"
  | "selectQuickRegisterMessage"
  | "submitQuickRegister"
  | "markBillingMonthCompleted"
  | "runAction"
  | "formatDateTime"
  | "getInboxDisplayParseStatus"
  | "getParseStatusLabel"
>;

export function InitialRegistrationFollowupSections(props: InitialRegistrationFollowupSectionsProps) {
  return (
    <div className="stitch-import-lower-grid">
      <SurfaceCard className="stitch-import-manual-card">
        <div className="stitch-import-manual-head">
          <div>
            <h3>예외 메일 수동 처리</h3>
            <p>엑셀에 바로 담기 어려운 미등록 메일만 여기서 1건씩 고객으로 연결합니다.</p>
          </div>
          <span className="stitch-import-inline-badge tone-review">
            {props.selectedQuickRegisterMessage ? "선택됨" : `${props.quickRegisterMessages.length}건 남음`}
          </span>
        </div>

        <div className="stitch-import-manual-layout">
          <div className="stitch-import-message-list">
            {props.quickRegisterMessages.length > 0 ? (
              props.quickRegisterMessages.map((message) => {
                const isSelected = props.quickRegisterForm.messageId === message.id;
                const parseStatus = props.getInboxDisplayParseStatus(message);
                return (
                  <SurfaceButton
                    key={message.id}
                    className={isSelected ? "stitch-import-message-card is-selected" : "stitch-import-message-card"}
                    onClick={() => props.selectQuickRegisterMessage(message.id)}
                  >
                    <div className="stitch-import-message-head">
                      <strong>{message.parsedData?.plantAddress || "주소 없음"}</strong>
                      <span>{props.getParseStatusLabel(parseStatus)}</span>
                    </div>
                    <p>{message.subject}</p>
                    <div className="stitch-import-message-meta">
                      <span>{message.parsedData?.billingMonth || "-"}</span>
                      <span>{props.formatDateTime(message.receivedAt)}</span>
                    </div>
                  </SurfaceButton>
                );
              })
            ) : (
              <div className="stitch-import-empty">미등록 고객 메일이 없습니다.</div>
            )}
          </div>

          <div className="stitch-import-manual-form">
            {props.selectedQuickRegisterMessage ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (props.busyKey !== null) return;
                  void props.runAction("quick-register-unmatched", props.submitQuickRegister);
                }}
              >
                <div className="stitch-import-selected-card">
                  <strong>{props.selectedQuickRegisterMessage.subject}</strong>
                  <div>
                    <span>{props.selectedQuickRegisterMessage.parsedData?.billingMonth || "정산월 없음"}</span>
                    <span>{props.selectedQuickRegisterMessage.parsedData?.plantName || "발전소명 없음"}</span>
                    <span>{props.formatDateTime(props.selectedQuickRegisterMessage.receivedAt)}</span>
                  </div>
                </div>

                <div className="stitch-import-form-grid">
                  <label>
                    대표자명
                    <input
                      value={props.quickRegisterForm.customerName}
                      onChange={(event) =>
                        props.setQuickRegisterForm((prev) => ({ ...prev, customerName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    주소
                    <input
                      value={props.quickRegisterForm.addr}
                      onChange={(event) => props.setQuickRegisterForm((prev) => ({ ...prev, addr: event.target.value }))}
                    />
                  </label>
                  <label>
                    사업자번호
                    <input
                      value={props.quickRegisterForm.businessNumber}
                      onChange={(event) =>
                        props.setQuickRegisterForm((prev) => ({ ...prev, businessNumber: event.target.value }))
                      }
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

                <div className="stitch-import-form-actions">
                  <button type="submit" className="stitch-import-primary-button" disabled={props.busyKey !== null}>
                    {props.isQuickRegistering ? "고객 연결 중..." : "고객 등록하고 연결"}
                    <span className="material-symbols-outlined">north_east</span>
                  </button>
                  <span>대표자명, 주소, 사업자번호, 세금계산서 상호만 맞으면 바로 연결됩니다.</span>
                </div>
              </form>
            ) : (
              <div className="stitch-import-empty">왼쪽에서 예외 메일을 선택하세요.</div>
            )}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="stitch-import-month-card">
        <div className="stitch-import-manual-head">
          <div>
            <h3>월별 완료 처리</h3>
            <p>이미 발행이 끝난 정산월은 완료 처리해 두면 이후 메일을 다시 올리지 않습니다.</p>
          </div>
        </div>

        <div className="stitch-import-month-list">
          {props.billingMonthSummaries.length > 0 ? (
            props.billingMonthSummaries.map((summary) => (
              <article key={summary.billingMonth} className={summary.completed ? "stitch-import-month-item is-complete" : "stitch-import-month-item"}>
                <div>
                  <strong>{summary.billingMonth}</strong>
                  <p>
                    메일 {summary.totalCount}건
                    {summary.actionableCount > 0 ? ` · 확인 필요 ${summary.actionableCount}건` : ""}
                    {summary.latestReceivedAt ? ` · 최근 수신 ${props.formatDateTime(summary.latestReceivedAt)}` : ""}
                  </p>
                </div>
                {summary.completed ? (
                  <span className="stitch-import-inline-badge tone-success">완료 처리</span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={props.busyKey !== null}
                    onClick={() =>
                      void props.runAction(
                        `complete-billing-month-${summary.billingMonth}`,
                        () => props.markBillingMonthCompleted(summary),
                        { reload: false }
                      )
                    }
                  >
                    완료 처리
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="stitch-import-empty">정산월이 파싱된 메일이 아직 없습니다.</div>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

export function InitialRegistrationTab(props: InitialRegistrationTabProps) {
  const onboardingFileInputRef = useRef<HTMLInputElement | null>(null);
  const onboardingDragDepthRef = useRef(0);
  const onboardingBusyKey = props.busyKey?.startsWith("customer-onboarding-") ? props.busyKey : null;
  const isDownloadingOnboardingTemplate = onboardingBusyKey === "customer-onboarding-template";
  const isPreviewingOnboarding = onboardingBusyKey === "customer-onboarding-preview";
  const isCommittingOnboarding = onboardingBusyKey === "customer-onboarding-commit";
  const isProceedingOnboardingCertificateRegistration = onboardingBusyKey === "customer-onboarding-cert-registration";
  const isRefreshingCustomerRenewalHelper = props.busyKey === "refresh-customer-renewal-helper";
  const showMailFollowupSections = props.showMailFollowupSections ?? true;
  const [isOnboardingDragActive, setIsOnboardingDragActive] = useState(false);
  const onboardingImportableCount =
    (props.customerOnboardingPreview?.createCount ?? 0) + (props.customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = props.customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;
  const previewRows = props.customerOnboardingPreview?.rows ?? [];
  const canInteractWithOnboardingUpload = props.busyKey === null;
  const isEmbeddedInOnboarding = props.embeddedInOnboarding ?? false;
  const onboardingHeaderStatusLabel = props.customerOnboardingPreview
    ? `${onboardingImportableCount}건 반영 준비`
    : "양식 업로드 단계";

  const submitOnboardingFile = (file: File | null) => {
    void props.runAction(
      "customer-onboarding-preview",
      async () => {
        if (file) {
          const normalizedFileName = file.name.trim().toLowerCase();
          if (!/\.(xlsx|xlsm|xls)$/i.test(normalizedFileName)) {
            throw new Error("Excel 파일(.xlsx, .xlsm, .xls)만 올릴 수 있습니다.");
          }
        }
        await props.handleCustomerOnboardingFileChange(file);
      },
      { reload: false }
    );
  };

  const openOnboardingFilePicker = () => {
    if (!canInteractWithOnboardingUpload) {
      return;
    }
    onboardingFileInputRef.current?.click();
  };

  return (
    <div className="stitch-import-screen">
      <input
        id="stitch-import-file-input"
        ref={onboardingFileInputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          submitOnboardingFile(file);
          event.currentTarget.value = "";
        }}
      />

      {isEmbeddedInOnboarding ? (
        <div className="stitch-onboarding-step-header">
          <div className="stitch-onboarding-step-header-copy">
            <div className="stitch-onboarding-step-header-top">
              <span className={props.customerOnboardingPreview ? "chip chip-success" : "chip"}>
                {onboardingHeaderStatusLabel}
              </span>
              {props.customerOnboardingFileName ? (
                <span className="stitch-onboarding-step-header-meta">{props.customerOnboardingFileName}</span>
              ) : null}
            </div>
            <h2>고객·인증서 양식 업로드</h2>
            <p>로컬 헬퍼 확인, 양식 다운로드, 엑셀 업로드, 미리보기 검토까지 이 단계에서 한 번에 진행합니다.</p>
          </div>
          {props.customerOnboardingPreview ? (
            <div className="stitch-onboarding-step-header-actions">
              <button
                type="button"
                className="stitch-import-primary-button"
                disabled={props.busyKey !== null || onboardingImportableCount === 0}
                onClick={() =>
                  void props.runAction("customer-onboarding-commit", props.commitCustomerOnboardingWorkbook, {
                    reload: false
                  })
                }
              >
                {isCommittingOnboarding ? "최종 반영 중..." : "최종 반영"}
                <span className="material-symbols-outlined">check_circle</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <SurfaceCard className="stitch-import-header">
          <div className="stitch-import-header-top">
            <div className="stitch-import-header-copy">
              <nav className="stitch-import-breadcrumb">
                <span>도입 준비</span>
                <span className="material-symbols-outlined">chevron_right</span>
                <span>데이터 대량 등록</span>
              </nav>
              <h2>납세자 대량 등록 및 예외 처리</h2>
            </div>
            <div className="stitch-import-header-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() => onboardingFileInputRef.current?.click()}
              >
                {isPreviewingOnboarding ? "파일 읽는 중..." : "작성 파일 올리기"}
              </button>
              <button
                type="button"
                className="stitch-import-primary-button"
                disabled={props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0}
                onClick={() =>
                  void props.runAction("customer-onboarding-commit", props.commitCustomerOnboardingWorkbook, {
                    reload: false
                  })
                }
              >
                {isCommittingOnboarding ? "최종 반영 중..." : "최종 반영"}
                <span className="material-symbols-outlined">check_circle</span>
              </button>
            </div>
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard
        className={
          props.customerRenewalAssistantOnline
            ? "stitch-import-helper-card is-ready"
            : "stitch-import-helper-card is-required"
        }
      >
        <div className="stitch-import-helper-head">
          <div className="stitch-import-helper-copy">
            <div className="stitch-import-helper-copy-top">
              <span
                className={
                  props.customerRenewalAssistantOnline
                    ? "stitch-import-inline-badge tone-success"
                    : "stitch-import-inline-badge tone-error"
                }
              >
                {props.customerRenewalAssistantOnline ? "헬퍼 연결됨" : "헬퍼 준비 필요"}
              </span>
              {props.customerRenewalAssistantHelperVersion ? (
                <span className="stitch-import-inline-badge">v{props.customerRenewalAssistantHelperVersion}</span>
              ) : null}
            </div>
            <h3>양식 다운로드 전에 고객 PC에서 로컬 헬퍼를 먼저 실행하세요.</h3>
            <p>
              이 PC에 저장된 공동인증서 목록을 엑셀 양식에 넣으려면 로컬 헬퍼가 설치되어 실행 중이어야 합니다.
              헬퍼 연결이 확인되면 그때 양식 다운로드가 열립니다.
            </p>
          </div>

          <div className="stitch-import-helper-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.location.assign(props.renewalHelperDownloadUrl)}
            >
              헬퍼 압축 다운로드
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() =>
                void props.runAction("refresh-customer-renewal-helper", props.refreshCustomerRenewalAssistant, {
                  reload: false
                })
              }
            >
              {isRefreshingCustomerRenewalHelper ? "상태 확인 중..." : "헬퍼 상태 확인"}
            </button>
            <button
              type="button"
              className="stitch-import-primary-button"
              disabled={props.busyKey !== null || !props.customerRenewalAssistantOnline}
              title={
                props.customerRenewalAssistantOnline
                  ? "공동인증서 목록이 포함된 양식을 다운로드합니다."
                  : "로컬 헬퍼를 실행한 뒤 상태 확인을 마치면 양식 다운로드가 열립니다."
              }
              onClick={() =>
                void props.runAction("customer-onboarding-template", props.downloadCustomerOnboardingTemplate, {
                  reload: false
                })
              }
            >
              {isDownloadingOnboardingTemplate ? "양식 준비 중..." : "공동인증서 포함 양식 다운로드"}
            </button>
          </div>
        </div>

        <div className="stitch-import-helper-steps">
          <div className="stitch-import-helper-step">
            <strong>1</strong>
            <span>헬퍼 압축 다운로드</span>
          </div>
          <div className="stitch-import-helper-step">
            <strong>2</strong>
            <span>고객 PC에서 헬퍼 실행</span>
          </div>
          <div className="stitch-import-helper-step">
            <strong>3</strong>
            <span>상태 확인 후 양식 다운로드</span>
          </div>
        </div>

        <div className="stitch-import-helper-status">
          <span>상태 메시지: {props.customerRenewalAssistantHelperMessage}</span>
          <span>
            {props.customerRenewalLoadedCertificateCount > 0
              ? `최근 읽은 공동인증서: ${props.customerRenewalLoadedCertificateCount}건`
              : "공동인증서 목록은 양식 다운로드 직전에 이 PC에서 다시 읽습니다."}
          </span>
          <span>마지막 확인: {props.formatDateTime(props.customerRenewalAssistantCheckedAt)}</span>
        </div>
      </SurfaceCard>

      <div className="stitch-import-grid">
        <SurfaceCard className={isOnboardingDragActive ? "stitch-import-upload-card is-drag-active" : "stitch-import-upload-card"}>
          <div
            className="stitch-import-upload-dropzone"
            role="button"
            tabIndex={canInteractWithOnboardingUpload ? 0 : -1}
            aria-disabled={!canInteractWithOnboardingUpload}
            onClick={() => openOnboardingFilePicker()}
            onKeyDown={(event) => {
              if (!canInteractWithOnboardingUpload) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openOnboardingFilePicker();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canInteractWithOnboardingUpload) {
                return;
              }
              onboardingDragDepthRef.current += 1;
              setIsOnboardingDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canInteractWithOnboardingUpload) {
                return;
              }
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canInteractWithOnboardingUpload) {
                return;
              }
              onboardingDragDepthRef.current = Math.max(0, onboardingDragDepthRef.current - 1);
              if (onboardingDragDepthRef.current === 0) {
                setIsOnboardingDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onboardingDragDepthRef.current = 0;
              setIsOnboardingDragActive(false);
              if (!canInteractWithOnboardingUpload) {
                return;
              }
              const file = event.dataTransfer.files?.[0] ?? null;
              submitOnboardingFile(file);
            }}
          >
            <div className="stitch-import-upload-icon">
              <span className="material-symbols-outlined">upload_file</span>
            </div>
            <h3>{isOnboardingDragActive ? "여기에 파일을 놓으면 바로 읽습니다" : "파일을 드래그하거나 클릭하여 업로드"}</h3>
            <p>
              Excel 형식만 지원합니다. 파일을 올리면 고객, 발전소, 공동인증서 시트를 함께 읽고 즉시 미리보기를 만듭니다.
            </p>
            <button
              type="button"
              className="stitch-import-upload-button"
              disabled={!canInteractWithOnboardingUpload}
              onClick={(event) => {
                event.stopPropagation();
                openOnboardingFilePicker();
              }}
            >
              파일 선택
            </button>
            <div className="stitch-import-upload-meta">
              <span>업로드 파일</span>
              <strong>{props.customerOnboardingFileName || "아직 선택되지 않음"}</strong>
            </div>
          </div>
        </SurfaceCard>

        <div className="stitch-import-summary-stack">
          <SurfaceCard as="article" className="stitch-import-summary-card tone-success">
            <div>
              <p>반영 가능</p>
              <strong>
                {onboardingImportableCount}
                <span>건</span>
              </strong>
            </div>
            <div className="stitch-import-summary-icon">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
          </SurfaceCard>
          <SurfaceCard as="article" className="stitch-import-summary-card tone-error">
            <div>
              <p>검토 필요</p>
              <strong>
                {onboardingBlockedCount}
                <span>건</span>
              </strong>
            </div>
            <div className="stitch-import-summary-icon">
              <span className="material-symbols-outlined">warning</span>
            </div>
          </SurfaceCard>
          {props.pendingOnboardingCertificateRegistrationCount > 0 ? (
            <SurfaceCard as="article" className="stitch-import-followup-card">
              <div>
                <p>인증서 연결 마무리</p>
                <strong>{props.pendingOnboardingCertificateRegistrationCount}건 남음</strong>
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() =>
                  void props.runAction(
                    "customer-onboarding-cert-registration",
                    props.proceedOnboardingCertificateRegistration,
                    { reload: false }
                  )
                }
              >
                {isProceedingOnboardingCertificateRegistration ? "연결 중..." : "바로 진행"}
              </button>
            </SurfaceCard>
          ) : null}
        </div>
      </div>

      {props.customerOnboardingNotice ? <div className="stitch-import-notice">{props.customerOnboardingNotice}</div> : null}
      {props.customerOnboardingError ? <div className="stitch-import-notice tone-error">{props.customerOnboardingError}</div> : null}
      {props.customerOnboardingPreview?.fileErrors.length ? (
        <div className="stitch-import-notice tone-error">{props.customerOnboardingPreview.fileErrors.join(" / ")}</div>
      ) : null}
      {showMailFollowupSections && props.quickRegisterNotice ? (
        <div className="stitch-import-notice tone-success">{props.quickRegisterNotice}</div>
      ) : null}
      {showMailFollowupSections && props.quickRegisterError ? (
        <div className="stitch-import-notice tone-error">{props.quickRegisterError}</div>
      ) : null}
      {showMailFollowupSections && props.completedBillingNotice ? (
        <div className="stitch-import-notice tone-success">{props.completedBillingNotice}</div>
      ) : null}

      <SurfaceCard className="stitch-import-table-card">
        <div className="stitch-import-table-head">
          <h3>
            <span className="material-symbols-outlined">rule</span>
            업로드 미리보기 및 검토 항목
          </h3>
          <div className="stitch-import-table-legend">
            <span className="tone-error">검토 필요</span>
            <span className="tone-review">기존 고객 갱신</span>
            <span className="tone-success">신규 등록</span>
          </div>
        </div>

        {previewRows.length > 0 ? (
          <div className="stitch-import-table-wrap">
            <table className="stitch-import-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>상태</th>
                  <th>사업자 등록번호</th>
                  <th>법인/상호명</th>
                  <th>발전소 / 인증서</th>
                  <th>검토 메모</th>
                  <th>조치</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const statusMeta = getPreviewStatusMeta(row.status);
                  return (
                    <tr key={`preview-row-${row.rowIndex}-${row.businessNumber}`}>
                      <td>{row.rowIndex}</td>
                      <td>
                        <span className={`stitch-import-inline-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                      </td>
                      <td>{row.businessNumber || "-"}</td>
                      <td>
                        <strong>{row.corpName || row.customerName || `고객 ${row.rowIndex}`}</strong>
                      </td>
                      <td>
                        발전소 {row.plantCount}건 / 인증서 {row.certificateCount}건
                      </td>
                      <td>{row.errors[0] || row.warnings[0] || "정상 반영 가능"}</td>
                      <td>{row.status === "blocked" ? "엑셀 수정" : row.status === "update" ? "검토 후 반영" : "바로 반영"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="stitch-import-empty">업로드된 고객 데이터가 아직 없습니다.</div>
        )}
      </SurfaceCard>

      {showMailFollowupSections ? <InitialRegistrationFollowupSections {...props} /> : null}
    </div>
  );
}
