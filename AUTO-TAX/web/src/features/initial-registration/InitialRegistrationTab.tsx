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

type InitialRegistrationTabProps = {
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
  downloadCustomerOnboardingTemplate: () => Promise<void>;
  handleCustomerOnboardingFileChange: (file: File | null) => Promise<void>;
  commitCustomerOnboardingWorkbook: () => Promise<void>;
  proceedOnboardingCertificateRegistration: () => Promise<void>;
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
  const isProceedingOnboardingCertificateRegistration = onboardingBusyKey === "customer-onboarding-cert-registration";
  const onboardingImportableCount =
    (props.customerOnboardingPreview?.createCount ?? 0) + (props.customerOnboardingPreview?.updateCount ?? 0);
  const onboardingBlockedCount = props.customerOnboardingPreview?.rows.filter((row) => row.status === "blocked").length ?? 0;

  return (
    <div className="initial-screen">
      <Panel
        className="panel-initial-onboarding"
        title="여러 고객 한 번에 등록"
        subtitle="엑셀 양식을 받고, 작성한 파일을 올린 뒤 고객 반영만 누르면 됩니다."
        actions={
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
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction("customer-onboarding-template", props.downloadCustomerOnboardingTemplate, { reload: false })}
            >
              {isDownloadingOnboardingTemplate ? "받는 중..." : "엑셀 양식 받기"}
            </button>
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => onboardingFileInputRef.current?.click()}
            >
              {isPreviewingOnboarding ? "읽는 중..." : "작성한 엑셀 올리기"}
            </button>
            <button
              disabled={props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0}
              onClick={() => void props.runAction("customer-onboarding-commit", props.commitCustomerOnboardingWorkbook, { reload: false })}
            >
              {isCommittingOnboarding ? "반영 중..." : "고객 반영"}
            </button>
            {props.pendingOnboardingCertificateRegistrationCount > 0 ? (
              <button
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
                {isProceedingOnboardingCertificateRegistration ? "연결 마무리 중..." : `인증서 연결 마무리 (${props.pendingOnboardingCertificateRegistrationCount}건 남음)`}
              </button>
            ) : null}
          </>
        }
      >
        <div className="initial-onboarding-summary">
          <div>
            <span>업로드 파일</span>
            <strong>{props.customerOnboardingFileName || "아직 없음"}</strong>
          </div>
          <div>
            <span>고객</span>
            <strong>{props.customerOnboardingPreview?.totalCustomers ?? 0}건</strong>
          </div>
          <div>
            <span>반영 가능</span>
            <strong>{onboardingImportableCount}건</strong>
          </div>
          <div>
            <span>검토 필요</span>
            <strong>{onboardingBlockedCount}건</strong>
          </div>
        </div>
        {props.customerOnboardingNotice ? (
          <div className="helper-box import-helper-box">
            <strong>안내</strong>
            <span>{props.customerOnboardingNotice}</span>
          </div>
        ) : null}
        {props.pendingOnboardingCertificateRegistrationCount > 0 ? (
          <div className="helper-box import-helper-box">
            <strong>다음 단계</strong>
            <span>
              고객 등록은 끝났고, 팝빌 전자세금용 인증서 등록이 {props.pendingOnboardingCertificateRegistrationCount}건 남아 있습니다.
              위 `인증서 연결 마무리` 버튼으로 순서대로 진행하면 됩니다.
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
      </Panel>

      {props.quickRegisterMessages.length > 0 || props.selectedQuickRegisterMessage ? (
        <details className="import-manual-fallback">
          <summary>
            <div className="import-manual-summary">
              <div className="import-manual-summary-copy">
                <strong>예외 메일 수동 처리</strong>
                <span>엑셀로 바로 처리하기 어려운 메일만 여기서 1건씩 등록합니다.</span>
              </div>
              <span className="chip chip-warn">
                {props.selectedQuickRegisterMessage ? "선택됨" : `${props.quickRegisterMessages.length}건 남음`}
              </span>
            </div>
          </summary>
          <div className="import-layout">
            <Panel
              className="panel-initial-unmatched"
              title={`미등록 메일 ${props.quickRegisterMessages.length}건`}
              subtitle="주소까지 읽힌 예외 메일만 모아 둔 목록입니다."
            >
              {props.quickRegisterMessages.length > 0 ? (
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
                          <span className={`status status-${props.getInboxDisplayParseStatus(message)}`}>{props.getParseStatusLabel(props.getInboxDisplayParseStatus(message))}</span>
                        </div>
                        <div className="customer-summary-meta">
                          <span>{message.parsedData?.billingMonth || "-"}</span>
                          <span>{props.formatDateTime(message.receivedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">주소까지 파싱된 미등록 고객 메일이 없습니다.</div>
              )}
            </Panel>

            <Panel
              className="panel-initial-quick-register"
              title="선택 메일 등록"
              subtitle="필수값만 적고 바로 고객으로 연결합니다."
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
                      <strong>필수값 4개만 확인하면 됩니다.</strong>
                      <span>대표자명, 주소, 사업자번호, 세금계산서 상호만 맞으면 바로 등록할 수 있습니다.</span>
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
                        {props.isQuickRegistering ? "등록 중..." : "고객 등록하고 연결"}
                      </button>
                      {props.isQuickRegistering ? <span className="field-hint">고객 등록, 팝빌 가입, 메일 연결을 처리하고 있습니다.</span> : null}
                    </div>
                  </form>
                </>
              ) : (
                <div className="empty">왼쪽에서 미등록 고객 메일을 선택하세요.</div>
              )}
            </Panel>
          </div>
        </details>
      ) : null}

      {props.quickRegisterNotice ? <div className="alert success">{props.quickRegisterNotice}</div> : null}
      {props.quickRegisterError ? <div className="alert error import-error-box">{props.quickRegisterError}</div> : null}

      <Panel
        className="panel-initial-months"
        title={`월별 완료 처리 ${props.billingMonthSummaries.length}개`}
        subtitle="이미 발행이 끝난 정산월은 완료 처리해 두면 이후 메일을 다시 올리지 않습니다."
      >
        {props.billingMonthSummaries.length > 0 ? (
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
                      onClick={() => void props.runAction(`complete-billing-month-${summary.billingMonth}`, () => props.markBillingMonthCompleted(summary), { reload: false })}
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
        )}
      </Panel>

      {props.completedBillingNotice ? <div className="alert success">{props.completedBillingNotice}</div> : null}
    </div>
  );
}
