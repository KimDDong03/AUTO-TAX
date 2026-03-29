import type React from "react";
import { Panel } from "../../components/ui";
import type { Customer, InvoiceDraft } from "../../types";

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  mobileNumber: string;
  bizType: string;
  bizClass: string;
  issueMode: "review" | "auto";
  popbillUserId: string;
  popbillPassword: string;
  memo: string;
};

type CustomerDetailTabId = "info" | "history";
type CustomerListFilter = "all" | "blocked";
type CustomerIssueReadiness = {
  canIssueNow: boolean;
  label: string;
  tone: "success" | "warn" | "danger";
};

type CustomersTabProps = {
  customers: Customer[];
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  filteredCustomers: Customer[];
  selectedCustomer: Customer | null;
  selectedCustomerReadiness: CustomerIssueReadiness | null;
  selectedCustomerIssuedDrafts: InvoiceDraft[];
  blockedCustomerCount: number;
  managedCustomerCount: number;
  managedCustomerLimit: number | null;
  hasReachedManagedCustomerLimit: boolean;
  busyKey: string | null;
  isSavingCustomer: boolean;
  customerSearchQuery: string;
  customerListFilter: CustomerListFilter;
  customerDetailTab: CustomerDetailTabId;
  customerForm: CustomerFormState;
  customerCertNotice: string;
  customerAddressResolveMessage: string;
  customerNameInputRef: React.RefObject<HTMLInputElement | null>;
  customerAddressLookupRef: React.MutableRefObject<string>;
  setCustomerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCustomerListFilter: React.Dispatch<React.SetStateAction<CustomerListFilter>>;
  setCustomerDetailTab: React.Dispatch<React.SetStateAction<CustomerDetailTabId>>;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  setCustomerAddressResolveMessage: React.Dispatch<React.SetStateAction<string>>;
  onCreateCustomer: () => void;
  onSelectCustomer: (customer: Customer) => void;
  onSaveCustomer: () => Promise<void>;
  onJoinCustomerPopbill: (customerId: number) => Promise<void>;
  onOpenCustomerCertRegistration: (customerId: number) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onRefreshAllCertificateStatuses: () => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customer: Customer) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  resolveCustomerAddress: () => Promise<string>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
  getCustomerIssueReadiness: (customer: Customer) => CustomerIssueReadiness;
  getCustomerCertificateSummary: (customer: Customer) => string;
  getCustomerPopbillSummary: (customer: Customer) => string;
  getIssueModeLabel: (issueMode: "review" | "auto") => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
  formatDateTime: (value: string | null) => string;
  formatMoney: (value: number) => string;
};

export function CustomersTab(props: CustomersTabProps) {
  return (
    <div className="customers-screen">
      {props.expiredCertCustomers.length > 0 ? (
        <div className="alert error">
          인증서 만료 고객 {props.expiredCertCustomers.length}건: {props.expiredCertCustomers.map((customer) => customer.customerName).join(", ")}
        </div>
      ) : null}
      {props.expiringSoonCustomers.length > 0 ? (
        <div className="alert warn">
          인증서 만료 예정 30일 이내 {props.expiringSoonCustomers.length}건: {props.expiringSoonCustomers
            .map((customer) => `${customer.customerName}(${props.formatCertificateExpireDate(customer.popbillCertExpireDate)})`)
            .join(", ")}
        </div>
      ) : null}
      <div className="customers-layout">
        <Panel
          className="panel-customer-list"
          title="고객 목록"
          actions={(
            <>
              <button
                className="btn-secondary"
                disabled={props.hasReachedManagedCustomerLimit}
                onClick={props.onCreateCustomer}
              >
                새 고객
              </button>
              <button onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}>인증서 일괄 점검</button>
            </>
          )}
        >
          <div className="customer-list-toolbar">
            <div className="customer-list-search">
              <input
                placeholder="대표자명 / 상호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </div>
            <div className="customer-list-filters">
              <button
                type="button"
                className={props.customerListFilter === "all" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("all")}
              >
                전체 {props.customers.length}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "blocked" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("blocked")}
              >
                준비 필요만 {props.blockedCustomerCount}명
              </button>
            </div>
          </div>
          <div className="helper-box">
            <strong>관리 고객 한도</strong>
            <span>
              현재 {props.managedCustomerCount}명
              {props.managedCustomerLimit !== null ? ` / 한도 ${props.managedCustomerLimit}명` : ""}
              {props.hasReachedManagedCustomerLimit ? " · 한도에 도달해 새 고객 등록이 잠겨 있습니다." : ""}
            </span>
          </div>
          <div className="list">
            {props.filteredCustomers.map((customer) => {
              const readiness = props.getCustomerIssueReadiness(customer);
              const isSelected = props.customerForm.id === customer.id;

              return (
                <button
                  key={customer.id}
                  type="button"
                  className={`customer-summary ${isSelected ? "selected" : ""} ${readiness.canIssueNow ? "customer-summary-ready" : "customer-summary-blocked"}`}
                  onClick={() => props.onSelectCustomer(customer)}
                >
                  <div className="customer-summary-head">
                    <div>
                      <strong>{customer.corpName}</strong>
                      <p>{customer.customerName}</p>
                    </div>
                    <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.label}</span>
                  </div>
                  <div className="customer-summary-meta">
                    <span>{customer.addr}</span>
                    <span>{props.getCustomerCertificateSummary(customer)}</span>
                  </div>
                </button>
              );
            })}
            {props.filteredCustomers.length === 0 ? (
              <div className="empty">
                {props.customerSearchQuery.trim() !== ""
                  ? "검색 결과가 없습니다."
                  : props.customerListFilter === "blocked"
                    ? "준비 필요 고객이 없습니다."
                    : "등록된 고객이 없습니다."}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          className="panel-customer-editor"
          title={props.selectedCustomer ? `${props.selectedCustomer.customerName}` : "새 고객 등록"}
          actions={props.selectedCustomer && props.customerDetailTab === "info" ? (
            <button
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction("save-customer-top", props.onSaveCustomer)}
            >
              {props.isSavingCustomer ? "고객 저장 중..." : "고객 저장"}
            </button>
          ) : null}
        >
          {props.selectedCustomer && props.selectedCustomerReadiness ? (
            <div className="customer-detail-top">
              <div className="customer-detail-copy">
                <strong>{props.selectedCustomer.corpName}</strong>
                <span>{props.selectedCustomer.customerName} · {props.selectedCustomer.addr}</span>
                <span>{props.getCustomerPopbillSummary(props.selectedCustomer)} · {props.getCustomerCertificateSummary(props.selectedCustomer)}</span>
              </div>
              <div className="customer-detail-stats">
                <div>
                  <span>주소</span>
                  <strong>{props.selectedCustomer.addr || "-"}</strong>
                </div>
                <div>
                  <span>발행 방식</span>
                  <strong>{props.getIssueModeLabel(props.selectedCustomer.issueMode)}</strong>
                </div>
                <div>
                  <span>팝빌 상태</span>
                  <strong>{props.getCustomerPopbillSummary(props.selectedCustomer)}</strong>
                </div>
                <div>
                  <span>인증서 상태</span>
                  <strong>{props.getCustomerCertificateSummary(props.selectedCustomer)}</strong>
                </div>
              </div>
              <div className="customer-detail-actions">
                <span className={`chip ${props.selectedCustomerReadiness.tone === "success" ? "chip-success" : props.selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                  {props.selectedCustomerReadiness.label}
                </span>
                {props.selectedCustomer.popbillState !== "joined" ? (
                  <button
                    className="btn-secondary"
                    onClick={() => void props.runAction(`join-${props.selectedCustomer!.id}`, async () => props.onJoinCustomerPopbill(props.selectedCustomer!.id))}
                  >
                    팝빌 가입
                  </button>
                ) : null}
                <button onClick={() => void props.runAction(`cert-url-${props.selectedCustomer!.id}`, async () => props.onOpenCustomerCertRegistration(props.selectedCustomer!.id), { reload: false })}>
                  {props.selectedCustomer.popbillCertRegistered ? "인증서 재등록" : "인증서 등록"}
                </button>
                <button className="btn-secondary" onClick={() => void props.runAction(`cert-status-${props.selectedCustomer!.id}`, async () => props.onRefreshCustomerCertificateStatus(props.selectedCustomer!.id))}>만료일 확인</button>
              </div>
              {props.customerCertNotice ? <div className="helper-box customer-cert-notice"><span>{props.customerCertNotice}</span></div> : null}
              <div className="helper-box-stack customer-cert-guide">
                <strong>공동인증서 등록 전 확인</strong>
                <span>아래 정보와 같은 고객 공동인증서만 등록하세요. 다르면 인증서 등록이나 이후 발행이 정상 동작하지 않을 수 있습니다.</span>
                <div className="fields three-column">
                  <div>
                    <span>사업자번호</span>
                    <strong>{props.selectedCustomer.businessNumber || "-"}</strong>
                  </div>
                  <div>
                    <span>세금계산서 상호</span>
                    <strong>{props.selectedCustomer.corpName || "-"}</strong>
                  </div>
                  <div>
                    <span>대표자명</span>
                    <strong>{props.selectedCustomer.customerName || "-"}</strong>
                  </div>
                </div>
              </div>
              <details className="customer-detail-secondary">
                <summary>더보기</summary>
                <div className="customer-detail-secondary-actions">
                  {props.selectedCustomer.popbillState === "joined" ? (
                    <button className="btn-ghost" onClick={() => void props.runAction(`reset-popbill-${props.selectedCustomer!.id}`, async () => props.onResetPopbillLink(props.selectedCustomer!))}>
                      연결 해제
                    </button>
                  ) : null}
                  <button className="btn-ghost btn-danger" onClick={() => void props.runAction(`delete-customer-${props.selectedCustomer!.id}`, async () => props.onDeleteCustomer(props.selectedCustomer!))}>
                    고객 삭제
                  </button>
                </div>
              </details>
            </div>
          ) : (
            <div className="customer-empty-state">
              <strong>새 고객을 등록합니다.</strong>
              <span>기존 고객을 수정하려면 왼쪽 목록에서 고객을 선택하세요.</span>
            </div>
          )}
          {props.selectedCustomer ? (
            <div className="customer-detail-tabs">
              <button
                type="button"
                className={props.customerDetailTab === "info" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("info")}
              >
                기본 정보
              </button>
              <button
                type="button"
                className={props.customerDetailTab === "history" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("history")}
              >
                발행 이력 {props.selectedCustomerIssuedDrafts.length}건
              </button>
            </div>
          ) : null}

          {props.selectedCustomer && props.customerDetailTab === "history" ? (
            <div className="customer-history-list">
              {props.selectedCustomerIssuedDrafts.length > 0 ? (
                props.selectedCustomerIssuedDrafts.map((draft) => {
                  const confirmNumber = props.getDraftConfirmNumber(draft);
                  return (
                    <article key={draft.id} className="customer-history-card">
                      <div className="customer-history-head">
                        <div>
                          <strong>{draft.itemName}</strong>
                          <span>{props.formatDateTime(draft.issuedAt)}</span>
                        </div>
                        <span className="chip chip-success">발행 완료</span>
                      </div>
                      <div className="customer-history-meta">
                        <span>공급가액 {props.formatMoney(draft.supplyCost)}원</span>
                        <span>합계 {props.formatMoney(draft.totalAmount)}원</span>
                        <span>관리번호 {draft.popbillMgtKey || "-"}</span>
                        <span>승인번호 {confirmNumber ?? "-"}</span>
                      </div>
                      <div className="customer-history-actions">
                        <button
                          className="btn-secondary"
                          disabled={props.busyKey !== null}
                          onClick={() => void props.runAction(`draft-info-${draft.id}`, async () => props.onShowDraftPopbillInfo(draft.id))}
                        >
                          상태조회
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={props.busyKey !== null}
                          onClick={() => void props.runAction(`draft-view-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "view-url"))}
                        >
                          보기
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={props.busyKey !== null}
                          onClick={() => void props.runAction(`draft-print-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "print-url"))}
                        >
                          인쇄
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty">이 고객의 발행 이력이 없습니다.</div>
              )}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (props.busyKey !== null) return;
                if (!props.selectedCustomer && props.hasReachedManagedCustomerLimit) return;
                void props.runAction(props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`, props.onSaveCustomer);
              }}
            >
              <div className="form-grid">
                <label>
                  대표자명
                  <input
                    ref={props.customerNameInputRef}
                    value={props.customerForm.customerName}
                    onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  />
                </label>
                <label>
                  주소
                  <input
                    value={props.customerForm.addr}
                    onChange={(event) => {
                      const nextAddress = event.target.value;
                      props.customerAddressLookupRef.current = "";
                      props.setCustomerAddressResolveMessage("");
                      props.setCustomerForm((prev) => ({ ...prev, addr: nextAddress }));
                    }}
                    onBlur={() => void props.resolveCustomerAddress()}
                  />
                  <span className="field-hint">저장된 도로명주소와 같은 주소로 들어온 메일만 자동 매칭됩니다.</span>
                  {props.customerAddressResolveMessage ? <span className="field-hint">{props.customerAddressResolveMessage}</span> : null}
                </label>
                <label>
                  사업자번호
                  <input value={props.customerForm.businessNumber} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, businessNumber: event.target.value }))} />
                </label>
                <label>
                  세금계산서 상호
                  <input value={props.customerForm.corpName} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, corpName: event.target.value }))} />
                </label>
                <label>
                  휴대폰 번호
                  <input value={props.customerForm.mobileNumber} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, mobileNumber: event.target.value }))} placeholder="01012345678" />
                  <span className="field-hint">공동인증서 갱신 자동화에서 고객별로 필요한 값입니다.</span>
                </label>
                <label>
                  업태
                  <input value={props.customerForm.bizType} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizType: event.target.value }))} />
                </label>
                <label>
                  업종
                  <input value={props.customerForm.bizClass} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizClass: event.target.value }))} />
                </label>
                <label className="full">
                  발행 방식
                  <select
                    value={props.customerForm.issueMode}
                    onChange={(event) =>
                      props.setCustomerForm((prev) => ({
                        ...prev,
                        issueMode:
                          prev.id === null ? "review" : event.target.value === "auto" ? "auto" : "review"
                      }))
                    }
                    disabled={props.customerForm.id === null}
                  >
                    <option value="review">검수 후 발행</option>
                    <option value="auto" disabled={props.customerForm.id === null}>월 자동 발행</option>
                  </select>
                  <span className="field-hint">
                    {props.customerForm.id === null
                      ? "처음 등록하는 고객은 먼저 검수 후 발행으로 저장됩니다. 저장 후 수정 화면에서 월 자동 발행으로 바꿀 수 있습니다."
                      : "자동 발행 고객은 작업공간 설정의 월 자동 실행일/시각에 메일 동기화 후 바로 발행되고, 검수 고객은 초안만 만들어집니다."}
                  </span>
                </label>
                <label className="full">
                  메모
                  <textarea rows={3} value={props.customerForm.memo} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, memo: event.target.value }))} />
                </label>
              </div>
              {!props.selectedCustomer ? (
                <div className="button-row">
                  <button type="submit" disabled={props.hasReachedManagedCustomerLimit || props.busyKey !== null}>
                    {props.isSavingCustomer ? "고객 등록 및 팝빌 가입 중..." : "고객 등록"}
                  </button>
                  {props.hasReachedManagedCustomerLimit ? (
                    <span className="field-hint">관리 고객 한도에 도달해 새 고객 등록이 잠겨 있습니다. 플랫폼 관리자에게 한도 상향을 요청하세요.</span>
                  ) : props.isSavingCustomer ? (
                    <span className="field-hint">고객 등록과 팝빌 가입을 처리하고 있습니다. 잠시만 기다려주세요.</span>
                  ) : null}
                </div>
              ) : null}
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
