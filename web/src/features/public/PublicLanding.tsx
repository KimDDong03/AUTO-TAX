import type React from "react";
import { useState } from "react";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PLACEHOLDER } from "../auth/passwordPolicy";
import { PUBLIC_PORTAL_COPY } from "./public-content";

export type PublicSignupInput = {
  loginId: string;
  password: string;
  organizationName: string;
  name: string;
  phone: string;
  kepcoEmail: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  thirdPartyAccepted: boolean;
  marketingConsent: boolean;
};

type PublicSignupFormState = PublicSignupInput & {
  passwordConfirm: string;
};

type PublicLandingProps = {
  signInAccount: string;
  setSignInAccount: React.Dispatch<React.SetStateAction<string>>;
  signInPassword: string;
  setSignInPassword: React.Dispatch<React.SetStateAction<string>>;
  authNotice: string;
  error: string;
  authBusy: boolean;
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSignUp: (input: PublicSignupInput) => Promise<boolean>;
};

const emptySignupForm: PublicSignupFormState = {
  loginId: "",
  password: "",
  passwordConfirm: "",
  organizationName: "",
  name: "",
  phone: "",
  kepcoEmail: "",
  termsAccepted: false,
  privacyAccepted: false,
  thirdPartyAccepted: false,
  marketingConsent: false
};

const publicTerms = [
  {
    id: "termsAccepted",
    label: "서비스 이용약관 동의",
    required: true,
    version: "terms_2026-05-07",
    body: "AUTO-TAX 작업공간 이용 조건, 계정 승인 절차, 서비스 제공 범위를 정리하는 약관 자리입니다. 실제 약관 전문은 운영 전 교체합니다."
  },
  {
    id: "privacyAccepted",
    label: "개인정보 수집 및 이용 동의",
    required: true,
    version: "privacy_2026-05-07",
    body: "가입 승인과 작업공간 개통을 위해 이름, 전화번호, 한전 수신 메일, 로그인 ID를 수집한다는 안내 자리입니다."
  },
  {
    id: "thirdPartyAccepted",
    label: "제3자 정보제공 동의",
    required: true,
    version: "third_party_2026-05-07",
    body: "전자세금계산서 발행과 메일 연동 준비 과정에서 필요한 외부 서비스 제공 범위를 안내하는 자리입니다."
  },
  {
    id: "marketingConsent",
    label: "마케팅 정보 수신 동의",
    required: false,
    version: "marketing_2026-05-07",
    body: "업데이트, 운영 안내, 프로모션 정보를 받을 수 있다는 선택 동의 안내 자리입니다."
  }
] as const;

function isKoreanMobilePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits);
}

function isKoreanPersonName(value: string): boolean {
  return /^[가-힣]{2,20}$/.test(value.trim());
}

function isReasonableOrganizationName(value: string): boolean {
  const normalized = value.trim();
  return (
    /[가-힣]/.test(normalized) &&
    /^[가-힣A-Za-z0-9\s().,&·_\-]+$/.test(normalized) &&
    normalized.replace(/\s+/g, "").length >= 2
  );
}

function isStrongEnoughSignupPassword(value: string): boolean {
  return isStrongPassword(value);
}

function isValidLoginId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value.trim());
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function PublicLanding({
  signInAccount,
  setSignInAccount,
  signInPassword,
  setSignInPassword,
  authNotice,
  error,
  authBusy,
  onSignIn,
  onSignUp
}: PublicLandingProps) {
  const [activeMode, setActiveMode] = useState<"login" | "signup">("login");
  const [signupForm, setSignupForm] = useState<PublicSignupFormState>(emptySignupForm);
  const [signupError, setSignupError] = useState("");

  const updateSignupForm = <Key extends keyof PublicSignupFormState>(
    key: Key,
    value: PublicSignupFormState[Key]
  ) => {
    setSignupForm((prev) => ({ ...prev, [key]: value }));
  };
  const signupPasswordMatches =
    signupForm.password.length > 0 &&
    signupForm.passwordConfirm.length > 0 &&
    signupForm.password === signupForm.passwordConfirm;
  const signupLoginIdFilled = signupForm.loginId.trim().length > 0;
  const signupLoginIdValid = isValidLoginId(signupForm.loginId);
  const signupOrganizationFilled = signupForm.organizationName.trim().length > 0;
  const signupOrganizationValid = isReasonableOrganizationName(signupForm.organizationName);
  const signupNameFilled = signupForm.name.trim().length > 0;
  const signupNameValid = isKoreanPersonName(signupForm.name);
  const signupPhoneFilled = signupForm.phone.trim().length > 0;
  const signupPhoneValid = isKoreanMobilePhone(signupForm.phone);
  const signupEmailFilled = signupForm.kepcoEmail.trim().length > 0;
  const signupEmailValid = isValidEmail(signupForm.kepcoEmail);
  const signupPasswordFilled = signupForm.password.length > 0;
  const signupPasswordValid = isStrongEnoughSignupPassword(signupForm.password);
  const signupRequiredFieldsFilled = Boolean(
    signupLoginIdValid &&
      signupPasswordValid &&
      signupPasswordMatches &&
      signupOrganizationValid &&
      signupNameValid &&
      signupPhoneValid &&
      signupEmailValid
  );
  const signupRequiredTermsAccepted =
    signupForm.termsAccepted && signupForm.privacyAccepted && signupForm.thirdPartyAccepted;
  const signupReady = signupRequiredFieldsFilled && signupRequiredTermsAccepted;
  const signupConsistencyMessage = signupReady
    ? "입력 정합성 확인 완료"
    : !signupRequiredFieldsFilled
      ? "필수 입력값과 비밀번호 확인을 맞춰주세요."
      : "필수 약관 동의가 필요합니다.";
  const showPasswordMismatch =
    signupForm.password.length > 0 &&
    signupForm.passwordConfirm.length > 0 &&
    signupForm.password !== signupForm.passwordConfirm;

  const submitSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignupError("");

    if (signupForm.password !== signupForm.passwordConfirm) {
      setSignupError("비밀번호와 확인 값이 일치하지 않습니다.");
      return;
    }

    if (!signupForm.termsAccepted || !signupForm.privacyAccepted || !signupForm.thirdPartyAccepted) {
      setSignupError("필수 약관에 모두 동의해야 회원가입 신청을 접수할 수 있습니다.");
      return;
    }

    const created = await onSignUp({
      loginId: signupForm.loginId,
      password: signupForm.password,
      organizationName: signupForm.organizationName,
      name: signupForm.name,
      phone: signupForm.phone,
      kepcoEmail: signupForm.kepcoEmail,
      termsAccepted: signupForm.termsAccepted,
      privacyAccepted: signupForm.privacyAccepted,
      thirdPartyAccepted: signupForm.thirdPartyAccepted,
      marketingConsent: signupForm.marketingConsent
    });

    if (created) {
      setSignupForm(emptySignupForm);
      setActiveMode("login");
    }
  };

  return (
    <div className="portal-shell">
      <div className="portal-page">
        <header className="portal-header">
          <div className="portal-brand">
            <img src="/logo-O2APlXk3.png" alt="AUTO-TAX" className="portal-brand-logo" />
            <div className="portal-brand-copy">
              <strong>AUTO-TAX</strong>
              <span>고객 작업공간 로그인</span>
            </div>
          </div>
          <p className="portal-header-note">회원가입 신청 후 운영자 승인부터 로그인이 가능합니다.</p>
        </header>

        <main className="portal-layout">
          <section
            className={`auth-card portal-login-card ${activeMode === "login" ? "portal-login-primary-card" : "portal-secondary-login-card"}`}
            id="public-login-card"
          >
            <div className="auth-copy">
              <span className="auth-badge">로그인</span>
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

            {activeMode === "signup" ? (
              <button type="button" className="portal-mode-link" onClick={() => setActiveMode("login")}>
                로그인 입력으로 돌아가기
              </button>
            ) : null}

            {authNotice || (activeMode === "login" && error) ? (
              <div className="portal-feedback" aria-live="polite">
                {authNotice ? (
                  <div className="alert success" role="status">
                    {authNotice}
                  </div>
                ) : null}
                {activeMode === "login" && error ? (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            className={`auth-card portal-login-card portal-signup-card ${activeMode === "signup" ? "portal-login-primary-card" : "portal-secondary-login-card"}`}
            id="public-signup-card"
          >
            <div className="auth-copy">
              <span className="auth-badge">회원가입</span>
              <h2>{PUBLIC_PORTAL_COPY.signupTitle}</h2>
              <p>{PUBLIC_PORTAL_COPY.signupDescription}</p>
            </div>

            <form className="auth-form portal-signup-form" onSubmit={(event) => void submitSignup(event)}>
              <div className="portal-signup-grid">
                <label>
                  <span>로그인 ID</span>
                  <input
                    value={signupForm.loginId}
                    onChange={(event) => updateSignupForm("loginId", event.target.value)}
                    placeholder="예: solaradmin"
                    autoComplete="username"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupLoginIdFilled && !signupLoginIdValid ? "portal-field-error" : signupLoginIdValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupLoginIdFilled && !signupLoginIdValid
                      ? "영문/숫자로 시작하는 3~32자 ID를 입력하세요."
                      : signupLoginIdValid
                        ? "사용 가능한 ID 형식입니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>고객사명</span>
                  <input
                    value={signupForm.organizationName}
                    onChange={(event) => updateSignupForm("organizationName", event.target.value)}
                    placeholder="예: 해성태양광"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupOrganizationFilled && !signupOrganizationValid ? "portal-field-error" : signupOrganizationValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupOrganizationFilled && !signupOrganizationValid
                      ? "한글을 포함한 실제 상호명을 입력하세요."
                      : signupOrganizationValid
                        ? "사용 가능한 고객사명입니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>비밀번호</span>
                  <input
                    type="password"
                    value={signupForm.password}
                    onChange={(event) => updateSignupForm("password", event.target.value)}
                    placeholder={PASSWORD_POLICY_PLACEHOLDER}
                    autoComplete="new-password"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupPasswordFilled && !signupPasswordValid ? "portal-field-error" : signupPasswordValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupPasswordFilled && !signupPasswordValid
                      ? PASSWORD_POLICY_MESSAGE
                      : signupPasswordValid
                        ? "사용 가능한 비밀번호입니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>비밀번호 확인</span>
                  <input
                    type="password"
                    value={signupForm.passwordConfirm}
                    onChange={(event) => updateSignupForm("passwordConfirm", event.target.value)}
                    placeholder="한 번 더 입력"
                    autoComplete="new-password"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      showPasswordMismatch ? "portal-field-error" : signupPasswordMatches ? "portal-field-ok" : ""
                    }`}
                  >
                    {showPasswordMismatch
                      ? "비밀번호가 일치하지 않습니다."
                      : signupPasswordMatches
                        ? "비밀번호가 일치합니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>이름</span>
                  <input
                    value={signupForm.name}
                    onChange={(event) => updateSignupForm("name", event.target.value)}
                    placeholder="담당자 이름"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupNameFilled && !signupNameValid ? "portal-field-error" : signupNameValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupNameFilled && !signupNameValid
                      ? "한글 실명 2~20자로 입력하세요."
                      : signupNameValid
                        ? "사용 가능한 이름입니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>전화번호</span>
                  <input
                    value={signupForm.phone}
                    onChange={(event) => updateSignupForm("phone", event.target.value)}
                    placeholder="010-1234-5678"
                    autoComplete="tel"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupPhoneFilled && !signupPhoneValid ? "portal-field-error" : signupPhoneValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupPhoneFilled && !signupPhoneValid
                      ? "휴대폰 번호 형식이 올바르지 않습니다."
                      : signupPhoneValid
                        ? "사용 가능한 휴대폰 번호입니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label className="full">
                  <span>한전 수신 메일</span>
                  <input
                    type="email"
                    value={signupForm.kepcoEmail}
                    onChange={(event) => updateSignupForm("kepcoEmail", event.target.value)}
                    placeholder="kepco-mail@example.com"
                    autoComplete="email"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupEmailFilled && !signupEmailValid ? "portal-field-error" : signupEmailValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupEmailFilled && !signupEmailValid
                      ? "메일 주소 형식이 올바르지 않습니다."
                      : signupEmailValid
                        ? "사용 가능한 메일 주소입니다."
                        : "\u00a0"}
                  </span>
                </label>
              </div>

              <div className="portal-terms-list" aria-label="회원가입 약관 동의">
                {publicTerms.map((term) => (
                  <details key={term.id} className="portal-term-item">
                    <summary>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(signupForm[term.id])}
                          onChange={(event) => updateSignupForm(term.id, event.target.checked)}
                        />
                        <span>
                          {term.label}
                          {term.required ? " (필수)" : " (선택)"}
                        </span>
                      </label>
                      <small>{term.version}</small>
                    </summary>
                    <p>{term.body}</p>
                  </details>
                ))}
              </div>

              {signupError || (activeMode === "signup" && error) ? (
                <div className="portal-feedback" aria-live="polite">
                  {signupError ? (
                    <div className="alert error" role="alert">
                      {signupError}
                    </div>
                  ) : null}
                  {activeMode === "signup" && error ? (
                    <div className="alert error" role="alert">
                      {error}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className={`portal-consistency ${signupReady ? "ready" : ""}`} aria-live="polite">
                {signupConsistencyMessage}
              </p>

              <div className="auth-actions portal-login-actions">
                <button
                  type="submit"
                  disabled={authBusy || !signupReady}
                  onClick={() => setActiveMode("signup")}
                >
                  {authBusy && activeMode === "signup" ? "신청 접수 중..." : "회원가입 신청"}
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
