import { useEffect, useId, useRef } from "react";
import type React from "react";
import {
  LANDING_FAQS,
  LANDING_FIT_SECTIONS,
  LANDING_HERO,
  LANDING_HERO_POINTS,
  LANDING_PRODUCT_PREVIEW,
  LANDING_WORKFLOW_STEPS,
  PUBLIC_PRICING_PLAN_LIST,
  type LandingTone,
  type PublicPricingPlanId,
  type PublicPricingQuote
} from "./public-content";

type SupportRequestFormValues = {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  message: string;
};

type PublicLandingProps = {
  signInAccount: string;
  setSignInAccount: React.Dispatch<React.SetStateAction<string>>;
  signInPassword: string;
  setSignInPassword: React.Dispatch<React.SetStateAction<string>>;
  showSupportRequestForm: boolean;
  setShowSupportRequestForm: React.Dispatch<React.SetStateAction<boolean>>;
  supportRequestForm: SupportRequestFormValues;
  setSupportRequestForm: React.Dispatch<React.SetStateAction<SupportRequestFormValues>>;
  pricingPlanId: PublicPricingPlanId;
  setPricingPlanId: React.Dispatch<React.SetStateAction<PublicPricingPlanId>>;
  managedCustomerCountInput: string;
  setManagedCustomerCountInput: React.Dispatch<React.SetStateAction<string>>;
  publicPricing: PublicPricingQuote;
  pricingSupportRequestPrefill: string;
  authNotice: string;
  error: string;
  authBusy: boolean;
  supportRequestBusy: boolean;
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSubmitSupportRequest: () => void | Promise<void>;
  onScrollToSection: (id: string) => void;
  onOpenSupportRequest: (prefillMessage?: string) => void;
  formatMoney: (value: number) => string;
};

function getToneChipClassName(tone: LandingTone) {
  if (tone === "success") return "chip chip-success";
  if (tone === "warn") return "chip chip-warn";
  return "chip";
}

function getToneStatusClassName(tone: LandingTone) {
  if (tone === "success") return "status status-issued";
  if (tone === "warn") return "status status-review";
  return "status status-pending";
}

function getToneSurfaceClassName(tone: LandingTone) {
  if (tone === "success") return "landing-tone-success";
  if (tone === "warn") return "landing-tone-warn";
  return "landing-tone-neutral";
}

export function PublicLanding({
  signInAccount,
  setSignInAccount,
  signInPassword,
  setSignInPassword,
  showSupportRequestForm,
  setShowSupportRequestForm,
  supportRequestForm,
  setSupportRequestForm,
  pricingPlanId,
  setPricingPlanId,
  managedCustomerCountInput,
  setManagedCustomerCountInput,
  publicPricing,
  pricingSupportRequestPrefill,
  authNotice,
  error,
  authBusy,
  supportRequestBusy,
  onSignIn,
  onSubmitSupportRequest,
  onScrollToSection,
  onOpenSupportRequest,
  formatMoney
}: PublicLandingProps) {
  const supportToggleLabel = showSupportRequestForm ? "문의 닫기" : "도입 문의";
  const supportPanelId = useId();
  const supportCompanyFieldRef = useRef<HTMLInputElement | null>(null);
  const supportToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showSupportRequestForm) return;
    const frameId = window.requestAnimationFrame(() => {
      supportCompanyFieldRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [showSupportRequestForm]);

  return (
    <div className="landing-shell">
      <header className="landing-topbar">
        <div className="landing-topbar-inner">
          <button type="button" className="landing-brand" onClick={() => onScrollToSection("landing-top")}>
            <span className="brand-badge landing-brand-badge">AT</span>
            <span className="landing-brand-copy">
              <strong>AUTO-TAX</strong>
            </span>
          </button>
          <nav className="landing-nav" aria-label="공개 페이지 탐색">
            <button type="button" className="landing-nav-button" onClick={() => onScrollToSection("landing-operations")}>
              운영 방식
            </button>
            <button type="button" className="landing-nav-button" onClick={() => onScrollToSection("landing-pricing")}>
              가격
            </button>
            <button type="button" className="landing-nav-button" onClick={() => onScrollToSection("landing-login-card")}>
              로그인
            </button>
          </nav>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero-band" id="landing-top">
          <div className="landing-hero-layout">
            <div className="landing-hero-intro">
              <span className="auth-badge">{LANDING_HERO.badge}</span>
              <h1>{LANDING_HERO.headline}</h1>
              <p>{LANDING_HERO.description}</p>
              <div className="landing-hero-cta-row">
                <button type="button" onClick={() => onScrollToSection("landing-operations")}>
                  운영 방식 보기
                </button>
                <button type="button" className="btn-secondary" onClick={() => onScrollToSection("landing-pricing")}>
                  가격 보기
                </button>
              </div>
              <div className="landing-hero-proof-row">
                {LANDING_HERO_POINTS.map((item) => (
                  <div key={item.label} className="landing-hero-proof-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <section className="landing-product-frame" aria-label="AUTO-TAX 운영 콘솔 미리보기">
              <div className="landing-product-frame-head">
                <div className="landing-product-frame-copy">
                  <span className="landing-product-frame-eyebrow">{LANDING_PRODUCT_PREVIEW.eyebrow}</span>
                  <h2>{LANDING_PRODUCT_PREVIEW.title}</h2>
                  <p>{LANDING_PRODUCT_PREVIEW.description}</p>
                </div>
                <div className="landing-product-frame-chips">
                  {LANDING_PRODUCT_PREVIEW.chips.map((item) => (
                    <span key={item} className="chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="landing-product-console">
                <div className="landing-product-summary-strip" role="list" aria-label="운영 요약 상태">
                  {LANDING_PRODUCT_PREVIEW.summary.map((item) => (
                    <article
                      key={item.label}
                      className={`landing-product-summary-item ${getToneSurfaceClassName(item.tone)}`}
                      role="listitem"
                    >
                      <span className="landing-product-summary-label">{item.label}</span>
                      <strong>{item.value}</strong>
                      <span className="landing-product-summary-detail">{item.detail}</span>
                    </article>
                  ))}
                </div>

                <div className="landing-product-console-grid">
                  <section className="landing-product-queue-panel" aria-label="오늘 운영 큐 미리보기">
                    <div className="landing-product-section-head">
                      <h3>운영 큐</h3>
                      <span>오늘 기준</span>
                    </div>
                    <div className="landing-product-queue-head" aria-hidden="true">
                      <span>구분</span>
                      <span>운영 항목</span>
                      <span>상태</span>
                      <span>기준</span>
                    </div>
                    <div className="landing-product-queue-body" role="list">
                      {LANDING_PRODUCT_PREVIEW.queueRows.map((row) => (
                        <article key={`${row.stage}-${row.title}`} className="landing-product-queue-row" role="listitem">
                          <span className="landing-product-row-stage">{row.stage}</span>
                          <div className="landing-product-row-copy">
                            <strong>{row.title}</strong>
                            <span>{row.detail}</span>
                          </div>
                          <span className={getToneStatusClassName(row.tone)}>{row.status}</span>
                          <span className="landing-product-row-note">{row.note}</span>
                        </article>
                      ))}
                    </div>
                  </section>

                  <aside className="landing-product-side-panel" aria-label="검수 메모와 운영 기록">
                    {LANDING_PRODUCT_PREVIEW.sideSections.map((section) => (
                      <section key={section.title} className="landing-product-side-group">
                        <div className="landing-product-section-head">
                          <h3>{section.title}</h3>
                          <span>{section.summary}</span>
                        </div>
                        <ul className="landing-product-side-list" role="list">
                          {section.items.map((item) => (
                            <li key={`${section.title}-${item.label}`} className="landing-product-side-item">
                              <div className="landing-product-side-copy">
                                <strong>{item.label}</strong>
                                <span>{item.detail}</span>
                              </div>
                              <span className={getToneChipClassName(item.tone)}>{item.status}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </aside>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className={showSupportRequestForm ? "landing-utility-rail is-support-open" : "landing-utility-rail"} id="landing-login-card">
          <div className="landing-utility-row">
            <div className="landing-utility-copy">
              <span className="chip landing-utility-chip">기존 고객</span>
              <strong>운영 계정으로 바로 접속</strong>
            </div>
            <form className="landing-utility-form" onSubmit={onSignIn}>
              <label className="landing-utility-field">
                <span>로그인 계정</span>
                <input
                  value={signInAccount}
                  onChange={(event) => setSignInAccount(event.target.value)}
                  placeholder="로그인 아이디 또는 이메일"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="landing-utility-field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="landing-utility-actions">
                <button type="submit" disabled={authBusy}>
                  {authBusy ? "로그인 중..." : "로그인"}
                </button>
                <button
                  ref={supportToggleRef}
                  type="button"
                  className="landing-auth-toggle"
                  onClick={() => {
                    setShowSupportRequestForm((prev) => !prev);
                    if (showSupportRequestForm) {
                      window.requestAnimationFrame(() => {
                        supportToggleRef.current?.focus();
                      });
                    }
                  }}
                  disabled={supportRequestBusy}
                  aria-expanded={showSupportRequestForm}
                  aria-controls={supportPanelId}
                >
                  {supportToggleLabel}
                </button>
              </div>
            </form>
          </div>

          {authNotice || error ? (
            <div className="landing-utility-feedback" aria-live="polite">
              {authNotice ? (
                <div className="alert success" role="status">
                  {authNotice}
                </div>
              ) : null}
              {error ? (
                <div className="alert error" role="alert">
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}

          {showSupportRequestForm ? (
            <div className="landing-support-panel" id={supportPanelId}>
              <div className="landing-support-head">
                <span className="chip landing-utility-chip">도입 문의</span>
                <strong>운영 규모만 이어서 남기면 됩니다</strong>
                <p>가격 계산기 메모가 그대로 들어옵니다.</p>
              </div>
              <div className="auth-form landing-support-form-grid">
                <label>
                  <span>회사명</span>
                  <input
                    ref={supportCompanyFieldRef}
                    value={supportRequestForm.companyName}
                    onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, companyName: event.target.value }))}
                    placeholder="회사명"
                  />
                </label>
                <label>
                  <span>담당자명</span>
                  <input
                    value={supportRequestForm.requesterName}
                    onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                    placeholder="담당자 이름"
                  />
                </label>
                <label>
                  <span>이메일</span>
                  <input
                    type="email"
                    value={supportRequestForm.requesterEmail}
                    onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterEmail: event.target.value }))}
                    placeholder="이메일"
                  />
                </label>
                <label>
                  <span>연락처</span>
                  <input
                    value={supportRequestForm.requesterPhone}
                    onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, requesterPhone: event.target.value }))}
                    placeholder="전화번호"
                  />
                </label>
                <label className="landing-support-field-full">
                  <span>요청 내용</span>
                  <textarea
                    rows={4}
                    value={supportRequestForm.message}
                    onChange={(event) => setSupportRequestForm((prev) => ({ ...prev, message: event.target.value }))}
                    placeholder="관리 고객 수와 현재 검수 방식을 적어주세요."
                  />
                </label>
              </div>
              <div className="landing-support-footer">
                <div className="auth-actions landing-support-actions">
                  <button type="button" onClick={() => void onSubmitSupportRequest()} disabled={supportRequestBusy}>
                    {supportRequestBusy ? "보내는 중..." : "문의 보내기"}
                  </button>
                </div>
                <p className="landing-auth-note">문의는 확인 후 순차적으로 회신합니다.</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="landing-band landing-flow-band" id="landing-operations">
          <div className="landing-section-head">
            <span className="landing-eyebrow">운영 방식</span>
            <h2>반복 발행은 같은 흐름으로 정리합니다</h2>
            <p>메일 수집, 대상 정리, 초안 준비, 검수 발행 순서만 먼저 읽히게 둡니다.</p>
          </div>

          <div className="landing-operations-layout">
            <div className="landing-flow-panel">
              <ol className="landing-flow-list">
                {LANDING_WORKFLOW_STEPS.map((step, index) => (
                  <li key={step.title} className="landing-flow-step">
                    <div className="landing-flow-rail" aria-hidden="true">
                      <span className={`landing-flow-marker ${getToneSurfaceClassName(step.tone)}`}>{index + 1}</span>
                      {index < LANDING_WORKFLOW_STEPS.length - 1 ? <span className="landing-flow-connector" /> : null}
                    </div>
                    <article className="landing-flow-content">
                      <div className="landing-flow-content-head">
                        <div className="landing-flow-title-group">
                          <span className="landing-flow-kicker">단계 {index + 1}</span>
                          <strong>{step.title}</strong>
                        </div>
                        <span className={getToneStatusClassName(step.tone)}>{step.status}</span>
                      </div>
                      <p>{step.summary}</p>
                      <span className="landing-flow-detail">{step.detail}</span>
                    </article>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="landing-flow-side">
              {LANDING_FIT_SECTIONS.map((section) => (
                <section key={section.title} className="landing-flow-side-group">
                  <div className="landing-flow-side-head">
                    <h3>{section.title}</h3>
                    <p>{section.summary}</p>
                  </div>
                  <ul className="landing-flow-side-list" role="list">
                    {section.items.map((item) => (
                      <li key={`${section.title}-${item.label}`} className="landing-flow-side-item">
                        <div className="landing-flow-side-copy">
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                        </div>
                        <span className={getToneChipClassName(item.tone)}>{item.status}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </aside>
          </div>
        </section>

        <section className="landing-band landing-pricing-band" id="landing-pricing">
          <div className="landing-section-head">
            <span className="landing-eyebrow">가격</span>
            <h2>고객 수 기준으로 바로 계산하는 구독 요금</h2>
            <p>계산기가 중심이고, 비교표는 포함 수와 초과 단가만 보조로 확인합니다.</p>
          </div>

          <div className="landing-pricing-layout">
            <aside className="landing-pricing-surface landing-calculator-surface">
              <div className="landing-calculator-head">
                <h3>예상 요금 계산기</h3>
                <p>현재 관리 고객 수 기준으로 바로 계산합니다.</p>
              </div>
              <div className="landing-segmented" role="tablist" aria-label="요금 기준 선택">
                {PUBLIC_PRICING_PLAN_LIST.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    role="tab"
                    aria-selected={plan.id === pricingPlanId}
                    className={plan.id === pricingPlanId ? "active" : ""}
                    onClick={() => setPricingPlanId(plan.id)}
                  >
                    {plan.label}
                  </button>
                ))}
              </div>
              <div className="landing-calculator-grid">
                <label className="landing-form-field">
                  <span>관리 고객 수</span>
                  <input
                    value={managedCustomerCountInput}
                    onChange={(event) => setManagedCustomerCountInput(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                    inputMode="numeric"
                    placeholder="예: 220"
                  />
                </label>
                <div className="landing-calculator-total">
                  <span>예상 월 구독료</span>
                  <strong>{formatMoney(publicPricing.totalPrice)}원</strong>
                  <p>{publicPricing.plan.label} 기준</p>
                </div>
              </div>
              <dl className="landing-breakdown-list">
                <div>
                  <dt>기본 요금</dt>
                  <dd>{formatMoney(publicPricing.plan.basePrice)}원</dd>
                </div>
                <div>
                  <dt>포함 고객 수</dt>
                  <dd>{publicPricing.includedCustomers.toLocaleString("ko-KR")}곳</dd>
                </div>
                <div>
                  <dt>초과 고객 수</dt>
                  <dd>{publicPricing.overageCount.toLocaleString("ko-KR")}곳</dd>
                </div>
                <div>
                  <dt>초과분 금액</dt>
                  <dd>{formatMoney(publicPricing.overagePrice)}원</dd>
                </div>
              </dl>
              <p className="landing-fineprint">외부 연동 정책이 바뀌면 요금 기준이 조정될 수 있습니다.</p>
              <div className="landing-calculator-actions">
                <button type="button" onClick={() => onOpenSupportRequest(pricingSupportRequestPrefill)}>
                  이 규모로 도입 문의
                </button>
              </div>
            </aside>

            <aside className="landing-plan-comparison" aria-label="플랜 비교">
              <div className="landing-plan-comparison-head">
                <strong>플랜 비교</strong>
                <p>포함 고객 수와 초과 단가만 확인합니다.</p>
              </div>
              <div className="landing-plan-table-head" aria-hidden="true">
                <span>플랜</span>
                <span>기본 요금</span>
                <span>포함 고객 수</span>
                <span>초과 단가</span>
              </div>
              <div className="landing-plan-table">
                {PUBLIC_PRICING_PLAN_LIST.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={plan.id === pricingPlanId ? "landing-plan-table-row landing-plan-table-row-active" : "landing-plan-table-row"}
                    onClick={() => setPricingPlanId(plan.id)}
                    aria-pressed={plan.id === pricingPlanId}
                  >
                    <span className="landing-plan-cell landing-plan-name-cell">
                      <span className="landing-plan-cell-label">플랜</span>
                      <strong>{plan.label}</strong>
                      <span className="landing-plan-meta-row">
                        <span className="landing-plan-meta">{plan.badge}</span>
                        <span className="landing-plan-note">{plan.summary}</span>
                      </span>
                    </span>
                    <span className="landing-plan-cell">
                      <span className="landing-plan-cell-label">기본 요금</span>
                      <strong>{formatMoney(plan.basePrice)}원</strong>
                    </span>
                    <span className="landing-plan-cell">
                      <span className="landing-plan-cell-label">포함 고객 수</span>
                      <strong>{plan.includedCustomers.toLocaleString("ko-KR")}곳</strong>
                    </span>
                    <span className="landing-plan-cell">
                      <span className="landing-plan-cell-label">초과 단가</span>
                      <strong>{formatMoney(plan.overagePrice)}원 / 곳</strong>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <div className="landing-faq-strip">
            <span className="landing-faq-label">자주 묻는 질문</span>
            <div className="landing-faq-rows">
              {LANDING_FAQS.map((item) => (
                <article key={item.question} className="landing-faq-row">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
