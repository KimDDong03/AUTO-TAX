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

  return (
    <div className="initial-screen">
      <Panel
        className="panel-initial-onboarding"
        title="인증서 기준 엑셀 초기 등록"
        subtitle="이 PC의 공동인증서 목록을 양식으로 내려받고, 전자세금용은 고객 생성에, 범용 공동인증서는 기존 고객 추가 연결에 사용합니다."
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
              {isDownloadingOnboardingTemplate ? "내리는 중..." : "양식 다운로드"}
            </button>
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null}
              onClick={() => onboardingFileInputRef.current?.click()}
            >
              {isPreviewingOnboarding ? "읽는 중..." : "양식 업로드"}
            </button>
            <button
              disabled={props.busyKey !== null || !props.customerOnboardingPreview || onboardingImportableCount === 0}
              onClick={() => void props.runAction("customer-onboarding-commit", props.commitCustomerOnboardingWorkbook, { reload: false })}
            >
              {isCommittingOnboarding ? "가져오는 중..." : "엑셀로 고객 등록"}
            </button>
            <button
              className="btn-secondary"
              disabled={props.busyKey !== null || props.pendingOnboardingCertificateRegistrationCount === 0}
              onClick={() =>
                void props.runAction(
                  "customer-onboarding-cert-registration",
                  props.proceedOnboardingCertificateRegistration,
                  { reload: false }
                )
              }
            >
              {isProceedingOnboardingCertificateRegistration
                ? "자동 등록 중..."
                : `전자세금용 인증서 자동 등록${
                    props.pendingOnboardingCertificateRegistrationCount > 0
                      ? ` (${props.pendingOnboardingCertificateRegistrationCount}건 남음)`
                      : ""
                  }`}
            </button>
          </>
        }
      >
        <div className="info-grid">
          <div>
            <span>업로드 파일</span>
            <strong>{props.customerOnboardingFileName || "-"}</strong>
          </div>
          <div>
            <span>고객</span>
            <strong>{props.customerOnboardingPreview?.totalCustomers ?? 0}건</strong>
          </div>
          <div>
            <span>발전소</span>
            <strong>{props.customerOnboardingPreview?.totalPlants ?? 0}건</strong>
          </div>
          <div>
            <span>공동인증서</span>
            <strong>{props.customerOnboardingPreview?.totalCertificates ?? 0}건</strong>
          </div>
          <div>
            <span>신규 생성</span>
            <strong>{props.customerOnboardingPreview?.createCount ?? 0}건</strong>
          </div>
          <div>
            <span>기존 갱신</span>
            <strong>{props.customerOnboardingPreview?.updateCount ?? 0}건</strong>
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
              위 `전자세금용 인증서 자동 등록` 버튼으로 순서대로 진행하면 됩니다.
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
        <p className="ops-helper-text">양식 다운로드를 누르면 이 PC의 공동인증서 목록이 먼저 채워집니다. 전자세금용은 인증서 비밀번호와 발전소 메일 매칭 주소만 적으면 사업자번호·상호·대표자·사업자 주소·업태·업종을 시스템이 인증서에서 읽어옵니다. 범용 공동인증서는 비밀번호와 `연결할 사업자번호`를 적으면 같은 고객에 추가 연결됩니다. 인증서 비밀번호 칸이 비어 있으면 시스템 설정의 공동인증서 공통 비밀번호를 fallback으로 사용합니다.</p>
        <div className="ops-list initial-onboarding-preview-list">
          {props.customerOnboardingPreview?.rows.length ? (
            props.customerOnboardingPreview.rows.map((row) => {
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
            })
          ) : (
            <div className="empty">양식을 업로드하면 인증서에서 읽은 사업자 정보를 기준으로 신규/갱신/검토 대상을 바로 확인할 수 있습니다.</div>
          )}
        </div>
      </Panel>

      {props.quickRegisterMessages.length > 0 || props.selectedQuickRegisterMessage ? (
        <details className="import-manual-fallback">
          <summary>예외 처리용 수동 등록 열기</summary>
          <div className="import-layout">
            <Panel className="panel-initial-unmatched" title={`미등록 고객 ${props.quickRegisterMessages.length}건`}>
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

            <Panel className="panel-initial-quick-register" title="빠른 등록">
              {props.selectedQuickRegisterMessage ? (
                <>
                  <div className="helper-box import-helper-box">
                    <strong>{props.selectedQuickRegisterMessage.subject}</strong>
                    <span>
                      {props.selectedQuickRegisterMessage.parsedData?.billingMonth || "-"} · {props.selectedQuickRegisterMessage.parsedData?.plantName || "-"}
                    </span>
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.busyKey !== null) return;
                      void props.runAction("quick-register-unmatched", props.submitQuickRegister);
                    }}
                  >
                    <div className="form-grid">
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
                        <span className="field-hint">메일에서 읽은 주소가 먼저 들어가 있습니다. 필요하면 수정 후 등록하세요.</span>
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
                    <div className="button-row">
                      <button type="submit" disabled={props.busyKey !== null}>
                        {props.isQuickRegistering ? "고객 등록 및 팝빌 가입 중..." : "고객 등록 후 메일 연결"}
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
