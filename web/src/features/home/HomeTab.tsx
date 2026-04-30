import { Icon } from "../../components/ui";
import type { CustomerContractRenewalDueItem, InboxMessage, InvoiceDraft } from "../../types";
import { formatContractRenewalStatus } from "./customerContractRenewals";
import type { HomeActionKey, HomeScreenModel } from "./homeScreenModel";

type HomeTabProps = {
  mailboxDataLoading: boolean;
  model: HomeScreenModel;
  screenTitle: string;
  userLabel: string;
  workspaceLabel: string;
  popbillModeLabel: string;
  reviewDrafts: InvoiceDraft[];
  recentInboxMessages: InboxMessage[];
  recentIssuedDrafts: InvoiceDraft[];
  contractRenewalDueItems: CustomerContractRenewalDueItem[];
  workFeedTab: "inbox" | "issued";
  reprocessableMessageCount: number;
  busyKey: string | null;
  onOpenAction: (actionKey: HomeActionKey) => void;
  onSelectFeedTab: (tab: "inbox" | "issued") => void;
  onIssueAllReviewDrafts: () => void;
  onIssueDraft: (draftId: number) => void;
  onReprocessInboxMessage: (messageId: number) => void;
  onReprocessAllMessages: () => void;
  onViewDraft: (draftId: number) => void;
  onCancelDraft: (draftId: number) => void;
  onCompleteContractRenewal: (item: CustomerContractRenewalDueItem) => void;
  onDownloadContractRenewals: () => void;
  getInboxDisplayParseStatus: (message: InboxMessage) => string;
  getParseStatusLabel: (status: string) => string;
  getDraftStatusLabel: (status: string) => string;
  isInboxActionable: (message: InboxMessage) => boolean;
  formatMoney: (value: number) => string;
  formatDateTime: (value: string | null) => string;
  simplifyIssueError: (value: string) => string;
};

function PriorityCardIcon(props: { actionKey: HomeActionKey }) {
  switch (props.actionKey) {
    case "exceptions":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5.2 8L12 12.8L18.8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "reviewQueue":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4.5" y="4.5" width="11" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 13H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="17.5" cy="14.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M19.3 16.3L21 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "blockedCustomers":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4L20 18H4L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 9.2V13.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.4" r="0.9" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

function getCardToneLabel(tone: "default" | "warn" | "danger"): string {
  if (tone === "danger") return "즉시 확인";
  return "오늘 처리";
}

function getCardToneClassName(tone: "default" | "warn" | "danger"): string {
  if (tone === "danger") return "home-priority-card tone-danger";
  if (tone === "warn") return "home-priority-card tone-warn";
  return "home-priority-card tone-default";
}

function getCardActionClassName(actionKey: HomeActionKey): string {
  if (actionKey === "exceptions") return "home-priority-card-exceptions";
  if (actionKey === "reviewQueue") return "home-priority-card-review";
  if (actionKey === "blockedCustomers") return "home-priority-card-blocked";
  return "";
}

function getHeaderChipClassName(tone: "default" | "warn" | "danger" | "success"): string {
  if (tone === "success") return "home-header-chip tone-success";
  if (tone === "warn") return "home-header-chip tone-warn";
  if (tone === "danger") return "home-header-chip tone-danger";
  return "home-header-chip";
}

function isMockHomeRow(id: number): boolean {
  return id < 0;
}

export function HomeTab(props: HomeTabProps) {
  const onboardingBanner = props.model.onboardingBanner;
  const onboardingProgressMainText = onboardingBanner
    ? onboardingBanner.progressText.replace("완료", "").split("·")[0]?.trim() || onboardingBanner.progressText
    : "";
  const hasLiveReviewDraft = props.reviewDrafts.some((draft) => !isMockHomeRow(draft.id));

  return (
    <div className="home-screen">
      <header className="home-page-header">
        <div className="home-page-header-copy">
          <h2>{props.screenTitle}</h2>
          <div className="home-page-header-chips">
            <span className="home-header-chip">{props.workspaceLabel}</span>
            {props.model.chips.map((metric) => (
              <span key={metric.label} className={getHeaderChipClassName(metric.tone)}>
                {metric.label} {metric.value}
              </span>
            ))}
          </div>
        </div>
        <div className="home-page-header-account">
          <div className="home-page-header-account-copy">
            <strong>{props.userLabel}</strong>
            <span>
              {props.workspaceLabel} · {props.popbillModeLabel}
            </span>
          </div>
          <span className="home-page-header-account-avatar" aria-hidden="true">
            <Icon name="user" className="home-page-header-account-avatar-icon" />
          </span>
        </div>
      </header>

      <div className="home-main-column">
        {props.mailboxDataLoading ? (
          <div className="helper-box import-helper-box">
            <strong>메일과 발행 대기를 읽는 중입니다.</strong>
          </div>
        ) : null}

        {onboardingBanner ? (
          <section className="home-onboarding-banner home-onboarding-b3">
            <div className="home-onboarding-progress-dial" aria-label={`도입 준비 ${onboardingBanner.progressText}`}>
              <span>도입 준비</span>
              <strong>{onboardingProgressMainText}</strong>
              <small>진행 중</small>
            </div>
            <div className="home-onboarding-banner-copy">
              <div className="home-onboarding-banner-head">
                <strong>세금계산서 발행을 시작하려면 도입 준비를 완료하세요.</strong>
              </div>
              <p>{onboardingBanner.summary}</p>
              <ul className="home-onboarding-check-list" aria-label="완료된 준비 항목">
                <li>메일 수신 설정</li>
                <li>기본 발행 설정</li>
                <li>담당자 초대</li>
                <li>권한 설정</li>
              </ul>
            </div>
            <div className="home-onboarding-next-card">
              <span>다음 진행 단계</span>
              <strong>{onboardingBanner.title.replace(/^다음 단계 ·\s*/, "")}</strong>
              <p>자동으로 수신 메일을 읽어 고객과 문서를 맞출 수 있도록 설정합니다.</p>
              <button type="button" onClick={() => props.onOpenAction(onboardingBanner.actionKey)}>
                {onboardingBanner.actionLabel}
              </button>
            </div>
          </section>
        ) : null}

        <section className="home-metric-row" aria-label="홈 운영 지표">
          {props.model.chips.map((metric) => (
            <article key={metric.label} className={`home-metric-cell tone-${metric.tone}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </section>

        <section className="home-section">
          <div className="home-section-head">
            <h3>{props.model.priorityTitle}</h3>
          </div>
          {props.model.priorityCards.length > 0 ? (
            <div className="home-priority-grid">
              {props.model.priorityCards.map((card) => (
                <article
                  key={card.key}
                  className={[getCardToneClassName(card.tone), getCardActionClassName(card.actionKey)].filter(Boolean).join(" ")}
                >
                  <div className="home-priority-card-top">
                    <span className="home-priority-icon">
                      <PriorityCardIcon actionKey={card.actionKey} />
                    </span>
                    <span className={`home-priority-tone ${card.tone === "danger" ? "tone-danger" : ""}`}>
                      {getCardToneLabel(card.tone)}
                    </span>
                  </div>
                  <div className="home-priority-copy">
                    <strong>{card.title} {card.value}</strong>
                    <p>{card.description}</p>
                  </div>
                  <button type="button" className="btn-secondary home-priority-button" onClick={() => props.onOpenAction(card.actionKey)}>
                    {card.actionLabel}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="work-priority-empty">
              <span className="chip chip-success">정상</span>
              <strong>{props.model.priorityEmptyState.title}</strong>
              <p>{props.model.priorityEmptyState.body}</p>
            </div>
          )}
        </section>

        <section id="home-contract-renewals" className="home-section home-contract-renewals-section">
          <div className="home-section-head home-contract-renewals-head">
            <div className="home-contract-renewals-title">
              <h3>갱신 고객</h3>
              <span className={props.contractRenewalDueItems.length > 0 ? "chip chip-warn" : "chip chip-success"}>
                {props.contractRenewalDueItems.length}명
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary home-contract-renewals-export"
              disabled={props.busyKey !== null || props.contractRenewalDueItems.length === 0}
              onClick={props.onDownloadContractRenewals}
            >
              엑셀 다운로드
            </button>
          </div>
          <div className={props.contractRenewalDueItems.length === 0 ? "queue-table-shell home-contract-renewals-table-shell is-empty" : "queue-table-shell home-contract-renewals-table-shell"}>
            <table className="responsive-table queue-table home-contract-renewals-table">
              <thead>
                <tr>
                  <th>상호명</th>
                  <th>대표자명</th>
                  <th>연락처</th>
                  <th>계약 시작월</th>
                  <th>계약 종료월</th>
                  <th>다음 시작월</th>
                  <th>상태</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {props.contractRenewalDueItems.map((item) => (
                  <tr key={item.customerId}>
                    <td data-label="상호명" className="home-contract-renewals-primary-cell">
                      <strong>{item.corpName || item.customerName}</strong>
                    </td>
                    <td data-label="대표자명">{item.customerName}</td>
                    <td data-label="연락처">{item.renewalContactMobile || "-"}</td>
                    <td data-label="계약 시작월">{item.contractStartMonth}</td>
                    <td data-label="계약 종료월">{item.contractEndMonth}</td>
                    <td data-label="다음 시작월">{item.nextContractStartMonth}</td>
                    <td data-label="상태">
                      <span className={item.status === "overdue" ? "status status-failed" : "status status-pending"}>
                        {formatContractRenewalStatus(item.status)}
                      </span>
                    </td>
                    <td data-label="액션" className="home-contract-renewals-action-cell">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={props.busyKey !== null}
                        onClick={() => props.onCompleteContractRenewal(item)}
                      >
                        갱신 완료
                      </button>
                    </td>
                  </tr>
                ))}
                {props.contractRenewalDueItems.length === 0 ? (
                  <tr className="queue-empty-row">
                    <td className="queue-empty-cell" colSpan={8}>
                      갱신 대상 고객이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section id="work-review-queue" className="home-section home-review-section">
          <div className="home-section-head">
            <h3>{props.model.reviewTitle}</h3>
            {hasLiveReviewDraft ? (
              <button type="button" className="home-table-header-action" onClick={props.onIssueAllReviewDrafts}>
                검수 건 직접 발행
              </button>
            ) : null}
          </div>
          <div className={props.reviewDrafts.length === 0 ? "queue-table-shell home-review-table-shell is-empty" : "queue-table-shell home-review-table-shell"}>
            <table className="responsive-table queue-table home-review-table">
              <thead>
                <tr>
                  <th>고객</th>
                  <th>초안</th>
                  <th>공급가액</th>
                  <th>상태</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {props.reviewDrafts.map((draft) => {
                  const isMockRow = isMockHomeRow(draft.id);

                  return (
                    <tr key={draft.id}>
                      <td data-label="고객" className="home-review-customer-cell">
                        <div className="home-review-primary">
                          <strong>{draft.customerName}</strong>
                        </div>
                      </td>
                      <td data-label="초안" className="home-review-item-cell">
                        <div className="home-review-secondary">
                          <strong>{draft.itemName}</strong>
                          <span>{draft.billingMonth || "정산월 미확인"}</span>
                        </div>
                      </td>
                      <td data-label="공급가액" className="home-review-amount-cell">
                        <strong>{props.formatMoney(draft.supplyCost)}원</strong>
                      </td>
                      <td data-label="상태" className="home-review-status-cell">
                        <div className="home-review-status">
                          <span className={`status status-${draft.status}`}>{props.getDraftStatusLabel(draft.status)}</span>
                        </div>
                        {draft.issueError ? (
                          <p className="cell-error" title={draft.issueError}>
                            {props.simplifyIssueError(draft.issueError)}
                          </p>
                        ) : null}
                      </td>
                      <td data-label="액션" className="home-review-action-cell">
                        <div className="button-row home-review-actions">
                          {isMockRow ? (
                            <span className="status status-pending">목업 데이터</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={props.busyKey !== null}
                                onClick={() => props.onViewDraft(draft.id)}
                              >
                                보기
                              </button>
                              {draft.status === "issuing" ? (
                                <span className="status status-pending">발행 중</span>
                              ) : (
                                <button type="button" disabled={props.busyKey !== null} onClick={() => props.onIssueDraft(draft.id)}>
                                  지금 직접 발행
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {props.reviewDrafts.length === 0 ? (
                  <tr className="queue-empty-row">
                    <td className="queue-empty-cell" colSpan={5}>
                      {props.model.reviewEmptyMessage}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside id="work-recent-history" className="home-side-column">
        <div className="home-side-head">
          <h3>{props.model.recentTitle}</h3>
          <p>{props.model.recentSubtitle}</p>
        </div>
        <div className="home-side-list">
          <section className="home-flow-panel">
            <div className="home-flow-panel-head">
              <strong>최근 수신 메일</strong>
              <button type="button" className="btn-secondary" onClick={() => props.onSelectFeedTab("inbox")}>
                모두 보기
              </button>
            </div>
            <div className="home-flow-panel-list home-flow-panel-list-inbox">
              {props.recentInboxMessages.map((message) => {
                const status = props.getInboxDisplayParseStatus(message);
                const isMockRow = isMockHomeRow(message.id);
                return (
                  <article key={message.id} className="home-flow-item">
                    <div className="home-flow-copy">
                      <strong>{message.parsedData?.plantName ?? "미확인 메일"}</strong>
                      <span className="home-flow-time">{props.formatDateTime(message.receivedAt)}</span>
                    </div>
                    <div className="home-flow-controls">
                      <span className={`status status-${status}`}>{props.getParseStatusLabel(status)}</span>
                      {props.isInboxActionable(message) && !isMockRow ? (
                        <button type="button" className="btn-secondary home-flow-action" onClick={() => props.onReprocessInboxMessage(message.id)}>
                          재처리
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {props.recentInboxMessages.length === 0 ? (
                <div className="empty">{props.model.recentInboxEmptyMessage}</div>
              ) : null}
              {props.reprocessableMessageCount > 0 ? (
                <div className="home-flow-panel-foot">
                  <button type="button" className="btn-secondary" onClick={props.onReprocessAllMessages}>
                    전체 재처리
                  </button>
                </div>
              ) : null}
            </div>
          </section>
          <section className="home-flow-panel">
            <div className="home-flow-panel-head">
              <strong>최근 발행 이력</strong>
              <button type="button" className="btn-secondary" onClick={() => props.onSelectFeedTab("issued")}>
                모두 보기
              </button>
            </div>
            <div className="home-flow-panel-list home-flow-panel-list-issued">
              {props.recentIssuedDrafts.map((draft) => {
                const isMockRow = isMockHomeRow(draft.id);

                return (
                  <article key={draft.id} className="home-flow-item">
                    <div className="home-flow-copy">
                      <strong>{draft.customerName}</strong>
                      <span className="home-flow-time">
                        {props.formatDateTime(draft.issuedAt)} · {props.formatMoney(draft.totalAmount)}원
                      </span>
                    </div>
                    <div className="home-flow-controls">
                      {isMockRow ? (
                        <span className="status status-pending">목업</span>
                      ) : (
                        <button type="button" className="btn-secondary home-flow-action" onClick={() => props.onViewDraft(draft.id)}>
                          보기
                        </button>
                      )}
                      <span className="status status-issued">발행 완료</span>
                    </div>
                  </article>
                );
              })}
              {props.recentIssuedDrafts.length === 0 ? (
                <div className="empty">{props.model.recentIssuedEmptyMessage}</div>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
