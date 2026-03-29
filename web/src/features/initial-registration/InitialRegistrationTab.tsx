import type React from "react";
import { Panel } from "../../components/ui";
import type { BootstrapPayload } from "../../types";

type CustomerImportFieldId = "customerName" | "businessNumber" | "corpName" | "addr";
type CustomerImportMapping = Record<CustomerImportFieldId, string>;
type CustomerImportParsedFile = {
  fileName: string;
  sheetName: string;
  rows: string[][];
};
type CustomerImportPreviewRow = {
  rowIndex: number;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  normalizedBusinessNumber: string;
  normalizedAddress: string;
  errors: string[];
  canImport: boolean;
};
type CustomerImportPreviewResponse = {
  totalRows: number;
  importableRows: number;
  blockedRows: number;
  rows: CustomerImportPreviewRow[];
};
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
  customerImportFile: CustomerImportParsedFile | null;
  customerImportRowsPayload: Array<{
    rowIndex: number;
    customerName: string;
    businessNumber: string;
    corpName: string;
    addr: string;
  }>;
  customerImportHeaderCandidates: Array<{ index: number; preview: string }>;
  customerImportHeaderRowIndex: number;
  customerImportMapping: CustomerImportMapping;
  customerImportHeaderOptions: Array<{ value: string; label: string }>;
  customerImportPreview: CustomerImportPreviewResponse | null;
  customerImportNotice: string;
  customerImportError: string;
  canPreviewCustomerImport: boolean;
  busyKey: string | null;
  quickRegisterMessages: InboxMessage[];
  quickRegisterForm: QuickRegisterFormState;
  selectedQuickRegisterMessage: InboxMessage | null;
  isQuickRegistering: boolean;
  quickRegisterNotice: string;
  quickRegisterError: string;
  billingMonthSummaries: BillingMonthSummary[];
  completedBillingNotice: string;
  setCustomerImportFile: React.Dispatch<React.SetStateAction<CustomerImportParsedFile | null>>;
  setCustomerImportHeaderRowIndex: React.Dispatch<React.SetStateAction<number>>;
  setCustomerImportMapping: React.Dispatch<React.SetStateAction<CustomerImportMapping>>;
  setCustomerImportPreview: React.Dispatch<React.SetStateAction<CustomerImportPreviewResponse | null>>;
  setCustomerImportError: React.Dispatch<React.SetStateAction<string>>;
  setCustomerImportNotice: React.Dispatch<React.SetStateAction<string>>;
  setQuickRegisterForm: React.Dispatch<React.SetStateAction<QuickRegisterFormState>>;
  handleCustomerImportFileChange: (file: File | null) => Promise<void>;
  applyCustomerImportHeaderRow: (index: number) => void;
  previewCustomerImport: () => Promise<void>;
  commitCustomerImport: () => Promise<void>;
  selectQuickRegisterMessage: (messageId: number) => void;
  submitQuickRegister: () => Promise<void>;
  markBillingMonthCompleted: (summary: BillingMonthSummary) => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatDateTime: (value: string | null) => string;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
  customerImportFieldOptions: Array<{ id: CustomerImportFieldId; label: string; keywords: string[] }>;
  emptyCustomerImportMapping: CustomerImportMapping;
};

export function InitialRegistrationTab(props: InitialRegistrationTabProps) {
  return (
    <div className="initial-screen">
      <div className="import-layout">
        <Panel
          className="panel-initial-import"
          title="엑셀 업로드"
          actions={(
            <button
              className="btn-secondary"
              onClick={() => {
                props.setCustomerImportFile(null);
                props.setCustomerImportHeaderRowIndex(0);
                props.setCustomerImportMapping(props.emptyCustomerImportMapping);
                props.setCustomerImportPreview(null);
                props.setCustomerImportError("");
                props.setCustomerImportNotice("");
              }}
            >
              초기화
            </button>
          )}
        >
          <div className="helper-box import-helper-box">
            <strong>지원 범위</strong>
            <span>`xlsx`, `csv`, 첫 시트, 필수 4개 컬럼만 지원합니다.</span>
          </div>

          <div className="form-grid">
            <label className="full">
              파일 선택
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => void props.handleCustomerImportFileChange(event.target.files?.[0] ?? null)}
              />
              <span className="field-hint">대표자명, 사업자번호, 세금계산서 상호, 주소를 포함한 파일을 올리세요.</span>
            </label>
          </div>

          {props.customerImportFile ? (
            <>
              <div className="helper-box import-helper-box">
                <strong>{props.customerImportFile.fileName}</strong>
                <span>{props.customerImportFile.sheetName} · 총 {props.customerImportRowsPayload.length}행 감지</span>
              </div>

              <div className="import-header-row-list">
                {props.customerImportHeaderCandidates.map((candidate) => (
                  <button
                    key={candidate.index}
                    type="button"
                    className={props.customerImportHeaderRowIndex === candidate.index ? "btn-secondary active-filter" : "btn-secondary"}
                    onClick={() => props.applyCustomerImportHeaderRow(candidate.index)}
                  >
                    {candidate.index + 1}행 헤더
                  </button>
                ))}
              </div>

              <div className="import-header-preview">
                {props.customerImportHeaderCandidates.find((candidate) => candidate.index === props.customerImportHeaderRowIndex)?.preview ?? "-"}
              </div>

              <div className="form-grid">
                {props.customerImportFieldOptions.map((field) => (
                  <label key={field.id}>
                    {field.label}
                    <select
                      value={props.customerImportMapping[field.id]}
                      onChange={(event) => {
                        props.setCustomerImportMapping((prev) => ({ ...prev, [field.id]: event.target.value }));
                        props.setCustomerImportPreview(null);
                        props.setCustomerImportError("");
                        props.setCustomerImportNotice("");
                      }}
                    >
                      <option value="">컬럼 선택</option>
                      {props.customerImportHeaderOptions.map((option) => (
                        <option key={`${field.id}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="button-row">
                <button
                  disabled={!props.canPreviewCustomerImport || props.busyKey !== null}
                  onClick={() => void props.runAction("customer-import-preview", props.previewCustomerImport)}
                >
                  미리보기
                </button>
                <button
                  className="btn-secondary"
                  disabled={!props.customerImportPreview || props.customerImportPreview.importableRows === 0 || props.busyKey !== null}
                  onClick={() => void props.runAction("customer-import-commit", props.commitCustomerImport)}
                >
                  가져오기 실행
                </button>
              </div>
            </>
          ) : (
            <div className="empty">엑셀 파일을 올리면 컬럼 매핑을 시작할 수 있습니다.</div>
          )}
        </Panel>

        <Panel className="panel-initial-preview" title="가져오기 미리보기">
          {props.customerImportPreview ? (
            <>
              <div className="helper-box import-helper-box">
                <strong>검증 결과</strong>
                <span>가져오기 가능 {props.customerImportPreview.importableRows}건 · 확인 필요 {props.customerImportPreview.blockedRows}건</span>
              </div>
              <div className="table-wrap">
                <table className="responsive-table import-preview-table">
                  <thead>
                    <tr>
                      <th>행</th>
                      <th>대표자명</th>
                      <th>사업자번호</th>
                      <th>세금계산서 상호</th>
                      <th>주소</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.customerImportPreview.rows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td data-label="행">{row.rowIndex}</td>
                        <td data-label="대표자명">{row.customerName || "-"}</td>
                        <td data-label="사업자번호">{row.businessNumber || "-"}</td>
                        <td data-label="세금계산서 상호">{row.corpName || "-"}</td>
                        <td data-label="주소">{row.addr || "-"}</td>
                        <td data-label="결과">
                          <span className={row.canImport ? "chip chip-success" : "chip chip-danger"}>
                            {row.canImport ? "가져오기 가능" : "확인 필요"}
                          </span>
                          {!row.canImport ? (
                            <div className="import-preview-errors">
                              {row.errors.map((errorMessage) => (
                                <span key={`${row.rowIndex}-${errorMessage}`}>{errorMessage}</span>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty">파일을 올리고 컬럼 매핑 후 미리보기를 실행하세요.</div>
          )}
        </Panel>
      </div>

      {props.customerImportNotice ? <div className="alert success">{props.customerImportNotice}</div> : null}
      {props.customerImportError ? <div className="alert error import-error-box">{props.customerImportError}</div> : null}

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
