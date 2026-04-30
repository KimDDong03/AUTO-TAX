import type React from "react";
import {
  PUBLIC_PORTAL_COPY,
  PUBLIC_PORTAL_FIRST_LOGIN_STEPS,
  PUBLIC_PORTAL_INFO_SECTIONS
} from "./public-content";

type PublicLandingProps = {
  consultationName: string;
  setConsultationName: React.Dispatch<React.SetStateAction<string>>;
  consultationPhone: string;
  setConsultationPhone: React.Dispatch<React.SetStateAction<string>>;
  consultationNotice: string;
  consultationError: string;
  consultationBusy: boolean;
  signInAccount: string;
  setSignInAccount: React.Dispatch<React.SetStateAction<string>>;
  signInPassword: string;
  setSignInPassword: React.Dispatch<React.SetStateAction<string>>;
  authNotice: string;
  error: string;
  authBusy: boolean;
  onConsultationSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function PublicLanding({
  consultationName,
  setConsultationName,
  consultationPhone,
  setConsultationPhone,
  consultationNotice,
  consultationError,
  consultationBusy,
  signInAccount,
  setSignInAccount,
  signInPassword,
  setSignInPassword,
  authNotice,
  error,
  authBusy,
  onConsultationSubmit,
  onSignIn
}: PublicLandingProps) {
  return (
    <div className="portal-shell">
      <div className="portal-page">
        <header className="portal-header">
          <div className="portal-brand">
            <span className="brand-badge">AT</span>
            <div className="portal-brand-copy">
              <span className="portal-kicker">{PUBLIC_PORTAL_COPY.badge}</span>
              <strong>AUTO-TAX</strong>
            </div>
          </div>
          <p className="portal-header-note">계정 생성은 상담 후 운영자가 진행합니다.</p>
        </header>

        <main className="portal-layout">
          <div className="portal-action-stack">
            <section className="auth-card portal-consult-card" id="public-consultation-card">
              <div className="auth-copy">
                <span className="auth-badge">상담 신청</span>
                <h1>{PUBLIC_PORTAL_COPY.title}</h1>
                <p>{PUBLIC_PORTAL_COPY.description}</p>
              </div>

              <form className="auth-form" onSubmit={onConsultationSubmit}>
                <label>
                  <span>이름</span>
                  <input
                    value={consultationName}
                    onChange={(event) => setConsultationName(event.target.value)}
                    placeholder="상담받을 분 이름"
                    autoComplete="name"
                    required
                  />
                </label>
                <label>
                  <span>전화번호</span>
                  <input
                    value={consultationPhone}
                    onChange={(event) => setConsultationPhone(event.target.value)}
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                </label>
                <div className="auth-actions portal-login-actions">
                  <button type="submit" disabled={consultationBusy}>
                    {consultationBusy ? "접수 중..." : "상담 신청"}
                  </button>
                </div>
              </form>

              {consultationNotice || consultationError ? (
                <div className="portal-feedback" aria-live="polite">
                  {consultationNotice ? (
                    <div className="alert success" role="status">
                      {consultationNotice}
                    </div>
                  ) : null}
                  {consultationError ? (
                    <div className="alert error" role="alert">
                      {consultationError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="auth-card portal-login-card portal-secondary-login-card" id="public-login-card">
              <div className="auth-copy">
                <span className="auth-badge">고객 로그인</span>
                <h2>{PUBLIC_PORTAL_COPY.loginTitle}</h2>
                <p>{PUBLIC_PORTAL_COPY.loginDescription}</p>
              </div>

              <form className="auth-form" onSubmit={onSignIn}>
                <label>
                  <span>로그인 계정</span>
                  <input
                    value={signInAccount}
                    onChange={(event) => setSignInAccount(event.target.value)}
                    placeholder="로그인 아이디 또는 이메일"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
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
                <div className="auth-actions portal-login-actions">
                  <button type="submit" className="btn-secondary" disabled={authBusy}>
                    {authBusy ? "로그인 중..." : "로그인"}
                  </button>
                </div>
              </form>

              {authNotice || error ? (
                <div className="portal-feedback" aria-live="polite">
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

              <p className="field-hint portal-help-note">{PUBLIC_PORTAL_COPY.contactHint}</p>
            </section>
          </div>

          <div className="portal-guide-stack">
            {PUBLIC_PORTAL_INFO_SECTIONS.map((section) => (
              <section key={section.title} className="portal-card">
                <span className="portal-card-eyebrow">{section.eyebrow}</span>
                <strong>{section.title}</strong>
                <p>{section.description}</p>
              </section>
            ))}

            <section className="portal-card" aria-labelledby="portal-first-login-title">
              <span className="portal-card-eyebrow">첫 로그인 후</span>
              <strong id="portal-first-login-title">처음 접속하면 이것부터 확인하세요</strong>
              <ol className="portal-checklist">
                {PUBLIC_PORTAL_FIRST_LOGIN_STEPS.map((step, index) => (
                  <li key={step.title}>
                    <span className="portal-checklist-step" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="portal-checklist-copy">
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
