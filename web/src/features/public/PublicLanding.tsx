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

type PublicTermId = "termsAccepted" | "privacyAccepted" | "thirdPartyAccepted" | "marketingConsent";

type PublicTermSection = {
  title: string;
  body?: string;
  items?: readonly string[];
};

type PublicTerm = {
  id: PublicTermId;
  label: string;
  required: boolean;
  version: string;
  sections: readonly PublicTermSection[];
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
  onPasswordReset: (email: string) => Promise<boolean>;
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

const publicTerms: readonly PublicTerm[] = [
  {
    id: "termsAccepted",
    label: "서비스 이용약관 동의",
    required: true,
    version: "terms_2026-05-12",
    sections: [
      {
        title: "목적",
        body: "이 약관은 AUTO-TAX가 제공하는 전자세금계산서 업무 자동화 서비스의 이용 조건, 계정 승인 절차, 이용자의 책임, 서비스 제한 사항을 정하기 위한 초안입니다."
      },
      {
        title: "서비스 범위",
        items: [
          "AUTO-TAX는 한전 수신 메일 분석, 고객 및 발전소 정보 관리, 전자세금계산서 초안 생성, 전자세금계산서 발행 보조, 인증서 갱신 점검 보조 기능을 제공합니다.",
          "서비스는 세무, 회계, 법률 자문을 대체하지 않으며, 최종 발행 여부와 발행 내용 확인 책임은 이용자에게 있습니다.",
          "인증서 갱신과 로컬 도구 기능은 Windows 환경에서의 점검과 보조 범위에 한정되며, 무인 갱신 완료를 보장하지 않습니다."
        ]
      },
      {
        title: "계정 신청과 승인",
        items: [
          "회원가입 신청은 운영자의 검토와 승인 후에만 실제 작업공간 접속으로 이어집니다.",
          "이용자는 신청 정보와 업무 설정 정보를 정확하게 입력해야 하며, 타인의 사업자 정보, 메일 계정, 인증서 정보를 권한 없이 입력해서는 안 됩니다.",
          "운영자는 허위 정보, 권한 불명확, 보안 위험, 서비스 제공 곤란 사유가 있는 신청을 보류하거나 거절할 수 있습니다."
        ]
      },
      {
        title: "보안과 비밀정보",
        items: [
          "이용자는 로그인 비밀번호, 메일 앱 비밀번호, 공동인증서 비밀번호 등 비밀정보를 안전하게 관리해야 합니다.",
          "AUTO-TAX는 원칙적으로 원본 인증서 파일, 인증서 비밀번호, 홈택스 로그인 정보를 서버에 저장하거나 재표시하지 않는 구조로 운영합니다.",
          "이용자가 로컬 PC에서 선택한 인증서 파일과 비밀번호는 해당 기능 수행에 필요한 범위에서만 처리되어야 합니다."
        ]
      },
      {
        title: "서비스 변경과 책임 제한",
        items: [
          "메일 양식, 외부 연동사 정책, 전자세금계산서 연동 또는 클라우드 인프라 상태에 따라 일부 기능이 지연되거나 실패할 수 있습니다.",
          "AUTO-TAX는 고의 또는 중대한 과실이 없는 한 이용자의 입력 오류, 외부 서비스 장애, 권한 없는 정보 입력, 최종 확인 없이 진행한 발행으로 인한 손해에 대해 책임을 제한할 수 있습니다.",
          "유료 요금제, 환불, 해지 정책은 별도 고지 또는 계약 조건에 따르며, 시범 운영 중에는 운영자가 별도로 안내할 수 있습니다."
        ]
      }
    ]
  },
  {
    id: "privacyAccepted",
    label: "개인정보 수집 및 이용 동의",
    required: true,
    version: "privacy_2026-05-12",
    sections: [
      {
        title: "수집 목적",
        items: [
          "회원가입 신청 접수, 본인 및 담당자 확인, 작업공간 개통 심사",
          "계정 생성, 로그인, 서비스 이용 안내, 고객 지원 및 보안 알림",
          "부정 이용 방지, 장애 조사, 서비스 운영 기록 관리"
        ]
      },
      {
        title: "수집 항목",
        items: [
          "필수: 로그인 ID, 비밀번호(인증 서비스에서 암호화 또는 해시 처리), 고객사명, 담당자 이름, 휴대폰 번호, 담당자 이메일 주소",
          "자동 생성: 신청 일시, 동의 버전과 동의 일시, 접속 IP, 브라우저 및 기기 정보",
          "승인 후 서비스 이용 과정에서 고객 사업자 정보, 발전소 주소, 메일 원문 또는 분석 결과, 세금계산서 발행 데이터가 추가로 처리될 수 있습니다."
        ]
      },
      {
        title: "보유 및 이용 기간",
        items: [
          "가입 신청 정보는 승인 또는 거절 처리와 분쟁 대응을 위해 신청일로부터 1년간 보관할 수 있습니다.",
          "승인된 계정 및 작업공간 정보는 서비스 이용 기간 동안 보관하며, 계약 종료 또는 회원 탈퇴 후에는 관계 법령상 보존 의무가 있는 정보를 제외하고 지체 없이 파기합니다.",
          "보안 로그와 접속 기록은 장애 대응, 침해사고 조사, 부정 이용 방지를 위해 내부 정책에 따라 일정 기간 보관할 수 있습니다."
        ]
      },
      {
        title: "동의 거부 권리",
        body: "이용자는 개인정보 수집 및 이용 동의를 거부할 수 있습니다. 다만 필수 항목은 회원가입 신청, 계정 승인, 작업공간 개통에 필요한 정보이므로 동의하지 않으면 서비스 신청이 제한됩니다."
      }
    ]
  },
  {
    id: "thirdPartyAccepted",
    label: "개인정보 처리위탁 및 외부 제공 동의",
    required: true,
    version: "third_party_2026-05-12",
    sections: [
      {
        title: "처리위탁 및 외부 제공 목적",
        body: "AUTO-TAX는 계정 인증, 클라우드 호스팅, 데이터 보관, 전자세금계산서 발행 연동, 메일 수신 분석 등 서비스 제공에 필요한 범위에서 외부 서비스를 이용할 수 있습니다."
      },
      {
        title: "예정 수탁자 및 제공처",
        items: [
          "Supabase: 로그인 인증, 세션 관리, 데이터베이스 운영",
          "Vercel 등 클라우드 호스팅 사업자: 웹 애플리케이션 배포, API 실행, 접속 로그 처리",
          "전자세금계산서 연동 사업자: 전자세금계산서 발행, 발행 결과 조회, 거래처 상태 확인",
          "승인 후 이용자가 연결하는 메일 서비스 제공자: 한전 수신 메일 조회와 분석을 위한 IMAP 또는 관련 메일 접근"
        ]
      },
      {
        title: "처리되는 정보",
        items: [
          "계정 및 작업공간 식별 정보, 담당자 연락처, 서비스 접속 기록",
          "고객 사업자 정보, 거래처 정보, 발전소 주소, 세금계산서 초안 및 발행 결과",
          "메일 제목, 본문, 첨부 또는 분석 결과 중 세금계산서 업무 처리에 필요한 정보"
        ]
      },
      {
        title: "보유 기간과 고지",
        items: [
          "수탁자와 제공처는 위 목적 달성 또는 위탁 계약 종료 시까지 필요한 범위에서 정보를 처리합니다.",
          "국외 클라우드 사업자를 이용하는 경우 국외 이전이 발생할 수 있으며, 실제 운영 수탁자, 이전 국가, 이전 일시와 방법은 개인정보처리방침에 최신 상태로 고지합니다.",
          "전자세금계산서 발행을 위해 법령 또는 외부 연동사 정책상 필요한 정보는 해당 법령과 정책에서 정한 기간 동안 보관될 수 있습니다."
        ]
      }
    ]
  },
  {
    id: "marketingConsent",
    label: "마케팅 정보 수신 동의",
    required: false,
    version: "marketing_2026-05-12",
    sections: [
      {
        title: "수신 목적",
        items: [
          "신규 기능, 운영 팁, 요금제, 이벤트, 프로모션 안내",
          "서비스 개선 설문, 도입 상담, 교육 또는 웨비나 안내"
        ]
      },
      {
        title: "이용 항목과 방법",
        items: [
          "이용 항목: 고객사명, 담당자 이름, 휴대폰 번호, 이메일 주소, 서비스 이용 상태",
          "발송 방법: 이메일, 문자메시지, 전화, 서비스 내 알림"
        ]
      },
      {
        title: "보유 기간과 철회",
        body: "마케팅 정보는 동의 철회 또는 서비스 종료 시까지 이용합니다. 선택 동의를 거부하거나 철회해도 회원가입 신청과 기본 서비스 이용에는 영향을 주지 않습니다."
      }
    ]
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
  onSignUp,
  onPasswordReset
}: PublicLandingProps) {
  const [activeMode, setActiveMode] = useState<"login" | "signup">("login");
  const [signupForm, setSignupForm] = useState<PublicSignupFormState>(emptySignupForm);
  const [signupError, setSignupError] = useState("");
  const [expandedTerms, setExpandedTerms] = useState<Set<PublicTermId>>(() => new Set());
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");

  const updateSignupForm = <Key extends keyof PublicSignupFormState>(
    key: Key,
    value: PublicSignupFormState[Key]
  ) => {
    setSignupForm((prev) => ({ ...prev, [key]: value }));
  };
  const toggleTerm = (termId: PublicTermId) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
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
    ? ""
    : !signupRequiredFieldsFilled
      ? "필수 입력값과 비밀번호 확인을 맞춰주세요."
      : "필수 약관 동의가 필요합니다.";
  const showPasswordMismatch =
    signupForm.password.length > 0 &&
    signupForm.passwordConfirm.length > 0 &&
    signupForm.password !== signupForm.passwordConfirm;

  const togglePasswordReset = () => {
    setActiveMode("login");
    setPasswordResetError("");
    setPasswordResetOpen((prev) => !prev);
    setPasswordResetEmail((prev) => prev || (isValidEmail(signInAccount) ? signInAccount.trim() : ""));
  };

  const submitPasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = passwordResetEmail.trim();
    setPasswordResetError("");

    if (!isValidEmail(email)) {
      setPasswordResetError("가입 시 사용한 이메일 주소를 입력하세요.");
      return;
    }

    const sent = await onPasswordReset(email);
    if (sent) {
      setPasswordResetEmail("");
      setPasswordResetOpen(false);
    }
  };

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
          </div>
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
            <button type="button" className="portal-mode-link" onClick={togglePasswordReset}>
              {passwordResetOpen ? "비밀번호 찾기 닫기" : "비밀번호 찾기"}
            </button>

            {passwordResetOpen ? (
              <form className="auth-form portal-password-reset-form" onSubmit={(event) => void submitPasswordReset(event)}>
                <label>
                  <span>가입 이메일</span>
                  <input
                    type="email"
                    value={passwordResetEmail}
                    onChange={(event) => setPasswordResetEmail(event.target.value)}
                    placeholder="manager@example.com"
                    autoComplete="email"
                    required
                  />
                </label>
                {passwordResetError ? (
                  <div className="alert error" role="alert">
                    {passwordResetError}
                  </div>
                ) : (
                  <p className="portal-password-reset-hint">메일의 링크에서 새 비밀번호를 설정하세요.</p>
                )}
                <div className="auth-actions portal-login-actions">
                  <button type="submit" disabled={authBusy}>
                    {authBusy ? "메일 발송 중..." : "재설정 메일 받기"}
                  </button>
                </div>
              </form>
            ) : null}

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
                      signupOrganizationFilled && !signupOrganizationValid ? "portal-field-error" : ""
                    }`}
                  >
                    {signupOrganizationFilled && !signupOrganizationValid
                      ? "한글을 포함한 실제 상호명을 입력하세요."
                      : "사업자등록증상에 기재된 회사명을 입력해주세요."}
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
                  <span>담당자 이메일</span>
                  <input
                    type="email"
                    value={signupForm.kepcoEmail}
                    onChange={(event) => updateSignupForm("kepcoEmail", event.target.value)}
                    placeholder="manager@example.com"
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
                {publicTerms.map((term) => {
                  const isExpanded = expandedTerms.has(term.id);
                  const termBodyId = `public-term-${term.id}-body`;

                  return (
                    <div key={term.id} className="portal-term-item">
                      <div className="portal-term-head">
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
                        <button
                          type="button"
                          className="portal-term-toggle"
                          aria-expanded={isExpanded}
                          aria-controls={termBodyId}
                          onClick={() => toggleTerm(term.id)}
                        >
                          {isExpanded ? "접기" : "펼치기"}
                        </button>
                      </div>
                      {isExpanded ? (
                        <div id={termBodyId} className="portal-term-body">
                          {term.sections.map((section) => (
                            <section key={section.title}>
                              <strong>{section.title}</strong>
                              {section.body ? <p>{section.body}</p> : null}
                              {section.items ? (
                                <ul>
                                  {section.items.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </section>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
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

              {signupConsistencyMessage ? (
                <p className="portal-consistency" aria-live="polite">
                  {signupConsistencyMessage}
                </p>
              ) : null}

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

        <footer className="portal-footer" aria-label="AUTO-TAX 회사 및 정책 정보">
          <nav className="portal-footer-links" aria-label="정책 문서">
            <a href="#public-signup-card">서비스 이용약관</a>
            <a href="#public-signup-card">개인정보처리방침</a>
            <a href="#public-signup-card">개인정보 수집·이용 동의</a>
            <a href="#public-signup-card">처리위탁 및 제3자 제공 안내</a>
          </nav>
          <dl className="portal-footer-info">
            <div>
              <dt>회사명</dt>
              <dd>KIYO</dd>
            </div>
            <div>
              <dt>대표자명</dt>
              <dd>김성결</dd>
            </div>
            <div>
              <dt>사업자등록번호</dt>
              <dd>559-22-02292</dd>
            </div>
            <div>
              <dt>고객지원</dt>
              <dd>
                <a href="mailto:auto-tax@kiyo.kr">auto-tax@kiyo.kr</a>
              </dd>
            </div>
          </dl>
        </footer>
      </div>
    </div>
  );
}
