import type React from "react";
import {
  PUBLIC_PORTAL_COPY,
  PUBLIC_PORTAL_FIRST_LOGIN_STEPS,
  PUBLIC_PORTAL_INFO_SECTIONS
} from "./public-content";

type PublicLandingProps = {
  signInAccount: string;
  setSignInAccount: React.Dispatch<React.SetStateAction<string>>;
  signInPassword: string;
  setSignInPassword: React.Dispatch<React.SetStateAction<string>>;
  authNotice: string;
  error: string;
  authBusy: boolean;
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function PublicLanding({
  signInAccount,
  setSignInAccount,
  signInPassword,
  setSignInPassword,
  authNotice,
  error,
  authBusy,
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
          <p className="portal-header-note">계약이 완료된 고객사만 이 화면으로 접속합니다.</p>
        </header>

        <main className="portal-layout">
          <section className="auth-card portal-login-card" id="public-login-card">
            <div className="auth-copy">
              <span className="auth-badge">AUTO-TAX</span>
              <h1>{PUBLIC_PORTAL_COPY.title}</h1>
              <p>{PUBLIC_PORTAL_COPY.description}</p>
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
                <button type="submit" disabled={authBusy}>
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
