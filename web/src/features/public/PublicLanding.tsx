import type React from "react";
import { useEffect, useRef, useState } from "react";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PLACEHOLDER } from "../auth/passwordPolicy";
import { PUBLIC_PORTAL_COPY } from "./public-content";

export type PublicSignupInput = {
  loginId: string;
  password: string;
  organizationName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  businessAddress: string;
  businessType: string;
  businessItem: string;
  name: string;
  phone: string;
  phoneVerificationId: string;
  kepcoEmail: string;
  kepcoEmailVerificationId: string;
  invoiceEmail: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  thirdPartyAccepted: boolean;
  marketingConsent: boolean;
};

export type PublicSignupLoginIdAvailability = {
  loginId: string;
  available: boolean;
};

export type PublicSignupPhoneVerificationSendResult = {
  verificationId: string;
  expiresAt: string;
  devCode?: string;
};

export type PublicSignupEmailVerificationSendResult = {
  verificationId: string;
  expiresAt: string;
  devCode?: string;
};

export type PublicLoginIdLookupResult = {
  found: boolean;
  loginId?: string;
  status?: "pending" | "approved" | "rejected";
};

type PublicSignupFormState = PublicSignupInput & {
  passwordConfirm: string;
};

type SignupLoginIdAvailabilityStatus = "idle" | "checking" | "available" | "duplicate" | "error";

type SignupLoginIdAvailabilityState = {
  loginId: string;
  status: SignupLoginIdAvailabilityStatus;
  message: string;
};

type SignupPhoneVerificationState = {
  phone: string;
  verificationId: string;
  code: string;
  status: "idle" | "sending" | "sent" | "verifying" | "verified" | "error";
  message: string;
  devCode?: string;
};

type SignupEmailVerificationState = {
  email: string;
  verificationId: string;
  code: string;
  status: "idle" | "sending" | "sent" | "verifying" | "verified" | "error";
  message: string;
  devCode?: string;
};

type LoginIdLookupState = {
  name: string;
  phone: string;
  verificationId: string;
  code: string;
  status: "idle" | "sending" | "sent" | "verifying" | "verified" | "looking-up" | "found" | "not-found" | "error";
  message: string;
  loginId: string;
  requestStatus?: "pending" | "approved" | "rejected";
  devCode?: string;
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
  onCheckLoginIdAvailability: (loginId: string) => Promise<PublicSignupLoginIdAvailability>;
  onSendSignupPhoneVerification: (phone: string) => Promise<PublicSignupPhoneVerificationSendResult>;
  onConfirmSignupPhoneVerification: (input: { verificationId: string; phone: string; code: string }) => Promise<boolean>;
  onSendSignupEmailVerification: (email: string) => Promise<PublicSignupEmailVerificationSendResult>;
  onConfirmSignupEmailVerification: (input: { verificationId: string; email: string; code: string }) => Promise<boolean>;
  onFindLoginId: (input: { name: string; phone: string; phoneVerificationId: string }) => Promise<PublicLoginIdLookupResult>;
  onPasswordReset: (email: string) => Promise<boolean>;
};

type PublicAuthMode = "login" | "signup";

const emptySignupForm: PublicSignupFormState = {
  loginId: "",
  password: "",
  passwordConfirm: "",
  organizationName: "",
  representativeName: "",
  businessRegistrationNumber: "",
  businessAddress: "",
  businessType: "",
  businessItem: "",
  name: "",
  phone: "",
  phoneVerificationId: "",
  kepcoEmail: "",
  kepcoEmailVerificationId: "",
  invoiceEmail: "",
  termsAccepted: false,
  privacyAccepted: false,
  thirdPartyAccepted: false,
  marketingConsent: false
};

const emptyLoginIdLookup: LoginIdLookupState = {
  name: "",
  phone: "",
  verificationId: "",
  code: "",
  status: "idle",
  message: "",
  loginId: ""
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
    version: "privacy_2026-05-14",
    sections: [
      {
        title: "수집 목적",
        items: [
          "회원가입 신청 접수, 본인 및 대표자 확인, 작업공간 개통 심사",
          "계정 생성, 로그인, 서비스 이용 안내, 고객 지원 및 보안 알림",
          "부정 이용 방지, 장애 조사, 서비스 운영 기록 관리"
        ]
      },
      {
        title: "수집 항목",
        items: [
          "필수: 로그인 ID, 비밀번호(인증 서비스에서 암호화 또는 해시 처리), 상호명, 대표자명, 대표자 휴대폰 번호, 사업자등록번호, 사업장 주소, 업태, 종목, 한전 수신메일 주소",
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
          "계정 및 작업공간 식별 정보, 대표자 및 가입자 연락처, 서비스 접속 기록",
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
          "이용 항목: 고객사명, 대표자명, 대표자 휴대폰 번호, 한전 수신메일 주소, 서비스 이용 상태",
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

function normalizeBusinessRegistrationNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidBusinessRegistrationNumber(value: string): boolean {
  return /^\d{10}$/.test(normalizeBusinessRegistrationNumber(value));
}

function isReasonableBusinessText(value: string): boolean {
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 80;
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

function getPublicAuthModeFromHash(): PublicAuthMode {
  if (typeof window === "undefined") {
    return "login";
  }

  return window.location.hash === "#signup" || window.location.hash === "#public-signup-card"
    ? "signup"
    : "login";
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
  onCheckLoginIdAvailability,
  onSendSignupPhoneVerification,
  onConfirmSignupPhoneVerification,
  onSendSignupEmailVerification,
  onConfirmSignupEmailVerification,
  onFindLoginId,
  onPasswordReset
}: PublicLandingProps) {
  const [activeMode, setActiveMode] = useState<PublicAuthMode>(() => getPublicAuthModeFromHash());
  const [signupForm, setSignupForm] = useState<PublicSignupFormState>(emptySignupForm);
  const [signupError, setSignupError] = useState("");
  const [signupLoginIdAvailability, setSignupLoginIdAvailability] = useState<SignupLoginIdAvailabilityState>({
    loginId: "",
    status: "idle",
    message: ""
  });
  const latestSignupLoginIdRef = useRef("");
  const [signupPhoneVerification, setSignupPhoneVerification] = useState<SignupPhoneVerificationState>({
    phone: "",
    verificationId: "",
    code: "",
    status: "idle",
    message: ""
  });
  const [signupEmailVerification, setSignupEmailVerification] = useState<SignupEmailVerificationState>({
    email: "",
    verificationId: "",
    code: "",
    status: "idle",
    message: ""
  });
  const [expandedTerms, setExpandedTerms] = useState<Set<PublicTermId>>(() => new Set());
  const [loginIdLookupOpen, setLoginIdLookupOpen] = useState(false);
  const [loginIdLookup, setLoginIdLookup] = useState<LoginIdLookupState>(emptyLoginIdLookup);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");

  useEffect(() => {
    const syncPublicAuthMode = () => setActiveMode(getPublicAuthModeFromHash());

    syncPublicAuthMode();
    window.addEventListener("hashchange", syncPublicAuthMode);
    return () => window.removeEventListener("hashchange", syncPublicAuthMode);
  }, []);

  const navigatePublicAuthMode = (mode: PublicAuthMode) => {
    setActiveMode(mode);
    if (mode === "signup") {
      setLoginIdLookupOpen(false);
      setPasswordResetOpen(false);
      setLoginIdLookup(emptyLoginIdLookup);
      setPasswordResetError("");
      setSignupError("");
    }

    if (typeof window !== "undefined") {
      const nextHash = mode === "signup" ? "#signup" : "#login";
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    }
  };

  const updateSignupForm = <Key extends keyof PublicSignupFormState>(
    key: Key,
    value: PublicSignupFormState[Key]
  ) => {
    if (key === "loginId") {
      latestSignupLoginIdRef.current = String(value).trim().toLowerCase();
      setSignupLoginIdAvailability({ loginId: latestSignupLoginIdRef.current, status: "idle", message: "" });
    }
    if (key === "phone") {
      setSignupPhoneVerification({
        phone: "",
        verificationId: "",
        code: "",
        status: "idle",
        message: ""
      });
    }
    if (key === "kepcoEmail") {
      setSignupEmailVerification({
        email: "",
        verificationId: "",
        code: "",
        status: "idle",
        message: ""
      });
    }
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
  const normalizedSignupLoginId = signupForm.loginId.trim().toLowerCase();
  const signupLoginIdFilled = signupForm.loginId.trim().length > 0;
  const signupLoginIdValid = isValidLoginId(signupForm.loginId);
  const signupLoginIdAvailabilityMatches =
    signupLoginIdAvailability.loginId === normalizedSignupLoginId && signupLoginIdAvailability.status !== "idle";
  const signupLoginIdAvailabilityMessage = signupLoginIdAvailabilityMatches ? signupLoginIdAvailability.message : "";
  const signupLoginIdAvailabilityClass = signupLoginIdAvailabilityMatches
    ? signupLoginIdAvailability.status === "available"
      ? "portal-field-ok"
      : signupLoginIdAvailability.status === "duplicate" || signupLoginIdAvailability.status === "error"
        ? "portal-field-error"
        : ""
    : "";
  const signupLoginIdDuplicate =
    signupLoginIdAvailabilityMatches && signupLoginIdAvailability.status === "duplicate";
  const signupOrganizationFilled = signupForm.organizationName.trim().length > 0;
  const signupOrganizationValid = isReasonableOrganizationName(signupForm.organizationName);
  const signupBusinessNumberFilled = signupForm.businessRegistrationNumber.trim().length > 0;
  const signupBusinessNumberValid = isValidBusinessRegistrationNumber(signupForm.businessRegistrationNumber);
  const signupBusinessAddressFilled = signupForm.businessAddress.trim().length > 0;
  const signupBusinessAddressValid = signupForm.businessAddress.trim().length >= 5 && signupForm.businessAddress.trim().length <= 160;
  const signupBusinessTypeFilled = signupForm.businessType.trim().length > 0;
  const signupBusinessTypeValid = isReasonableBusinessText(signupForm.businessType);
  const signupBusinessItemFilled = signupForm.businessItem.trim().length > 0;
  const signupBusinessItemValid = isReasonableBusinessText(signupForm.businessItem);
  const signupNameFilled = signupForm.name.trim().length > 0;
  const signupNameValid = isKoreanPersonName(signupForm.name);
  const signupPhoneFilled = signupForm.phone.trim().length > 0;
  const signupPhoneValid = isKoreanMobilePhone(signupForm.phone);
  const signupPhoneNormalized = signupForm.phone.replace(/\D/g, "");
  const signupPhoneVerified =
    signupPhoneVerification.status === "verified" &&
    signupPhoneVerification.phone === signupPhoneNormalized &&
    signupPhoneVerification.verificationId.length > 0;
  const signupEmailFilled = signupForm.kepcoEmail.trim().length > 0;
  const signupEmailValid = isValidEmail(signupForm.kepcoEmail);
  const signupEmailNormalized = signupForm.kepcoEmail.trim().toLowerCase();
  const signupEmailVerified =
    signupEmailVerification.status === "verified" &&
    signupEmailVerification.email === signupEmailNormalized &&
    signupEmailVerification.verificationId.length > 0;
  const signupPasswordFilled = signupForm.password.length > 0;
  const signupPasswordValid = isStrongEnoughSignupPassword(signupForm.password);
  const signupRequiredFieldsFilled = Boolean(
    signupLoginIdValid &&
      signupPasswordValid &&
      signupPasswordMatches &&
      signupOrganizationValid &&
      signupBusinessNumberValid &&
      signupBusinessAddressValid &&
      signupBusinessTypeValid &&
      signupBusinessItemValid &&
      signupNameValid &&
      signupPhoneValid &&
      signupPhoneVerified &&
      signupEmailValid &&
      signupEmailVerified
  );
  const signupRequiredTermsAccepted =
    signupForm.termsAccepted && signupForm.privacyAccepted && signupForm.thirdPartyAccepted;
  const signupReady = signupRequiredFieldsFilled && signupRequiredTermsAccepted && !signupLoginIdDuplicate;
  const signupConsistencyMessage = signupReady
    ? ""
    : signupLoginIdDuplicate
      ? "다른 로그인 ID를 입력해주세요."
      : signupPhoneValid && !signupPhoneVerified
        ? "휴대폰 인증을 완료해주세요."
        : signupEmailValid && !signupEmailVerified
          ? "한전 수신메일 인증을 완료해주세요."
      : !signupRequiredFieldsFilled
        ? "필수 입력값과 비밀번호 확인을 맞춰주세요."
        : "필수 약관 동의가 필요합니다.";
  const showPasswordMismatch =
    signupForm.password.length > 0 &&
    signupForm.passwordConfirm.length > 0 &&
    signupForm.password !== signupForm.passwordConfirm;
  const loginIdLookupNameFilled = loginIdLookup.name.trim().length > 0;
  const loginIdLookupNameValid = isKoreanPersonName(loginIdLookup.name);
  const loginIdLookupPhoneFilled = loginIdLookup.phone.trim().length > 0;
  const loginIdLookupPhoneValid = isKoreanMobilePhone(loginIdLookup.phone);
  const loginIdLookupPhoneNormalized = loginIdLookup.phone.replace(/\D/g, "");
  const loginIdLookupPhoneVerified =
    loginIdLookup.status === "verified" &&
    loginIdLookup.phone.replace(/\D/g, "") === loginIdLookupPhoneNormalized &&
    loginIdLookup.verificationId.length > 0;
  const loginIdLookupReady = loginIdLookupNameValid && loginIdLookupPhoneValid && loginIdLookupPhoneVerified;

  const togglePasswordReset = () => {
    navigatePublicAuthMode("login");
    setLoginIdLookupOpen(false);
    setPasswordResetError("");
    setPasswordResetOpen((prev) => !prev);
    setPasswordResetEmail((prev) => prev || (isValidEmail(signInAccount) ? signInAccount.trim() : ""));
  };

  const toggleLoginIdLookup = () => {
    navigatePublicAuthMode("login");
    setPasswordResetOpen(false);
    setPasswordResetError("");
    setLoginIdLookupOpen((prev) => !prev);
  };

  const updateLoginIdLookup = <Key extends keyof LoginIdLookupState>(
    key: Key,
    value: LoginIdLookupState[Key]
  ) => {
    setLoginIdLookup((prev) => {
      const next = {
        ...prev,
        [key]: value
      };

      if (key === "phone") {
        return {
          ...next,
          verificationId: "",
          code: "",
          status: "idle",
          message: "",
          loginId: "",
          requestStatus: undefined,
          devCode: undefined
        };
      }

      if (key === "name") {
        return {
          ...next,
          status: prev.status === "found" || prev.status === "not-found" ? "verified" : prev.status,
          message: prev.status === "found" || prev.status === "not-found" ? "" : prev.message,
          loginId: "",
          requestStatus: undefined
        };
      }

      return next;
    });
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

  const requestLoginIdLookupPhoneVerification = async () => {
    if (!loginIdLookupPhoneValid) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "휴대폰 번호를 먼저 올바르게 입력하세요."
      }));
      return;
    }

    setLoginIdLookup((prev) => ({
      ...prev,
      verificationId: "",
      code: "",
      status: "sending",
      message: "인증번호를 보내는 중입니다.",
      loginId: "",
      requestStatus: undefined,
      devCode: undefined
    }));

    try {
      const result = await onSendSignupPhoneVerification(loginIdLookup.phone);
      setLoginIdLookup((prev) => ({
        ...prev,
        phone: loginIdLookupPhoneNormalized,
        verificationId: result.verificationId,
        code: result.devCode ?? "",
        status: "sent",
        message: result.devCode
          ? `개발용 인증번호 ${result.devCode}를 입력하세요.`
          : "인증번호를 보냈습니다. 5분 안에 입력하세요.",
        devCode: result.devCode
      }));
    } catch (verificationError) {
      setLoginIdLookup((prev) => ({
        ...prev,
        verificationId: "",
        code: "",
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 발송에 실패했습니다."
      }));
    }
  };

  const confirmLoginIdLookupPhoneVerification = async () => {
    if (!loginIdLookup.verificationId || loginIdLookup.code.trim().length !== 6) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "인증번호 6자리를 입력하세요."
      }));
      return;
    }

    setLoginIdLookup((prev) => ({
      ...prev,
      status: "verifying",
      message: "인증번호를 확인하는 중입니다."
    }));

    try {
      const verified = await onConfirmSignupPhoneVerification({
        verificationId: loginIdLookup.verificationId,
        phone: loginIdLookup.phone,
        code: loginIdLookup.code
      });
      setLoginIdLookup((prev) => ({
        ...prev,
        status: verified ? "verified" : "error",
        message: verified ? "휴대폰 인증이 완료되었습니다." : "인증번호 확인에 실패했습니다."
      }));
    } catch (verificationError) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 확인에 실패했습니다."
      }));
    }
  };

  const submitLoginIdLookup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!loginIdLookupNameValid) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "가입 시 입력한 한글 이름을 입력하세요."
      }));
      return;
    }

    if (!loginIdLookupReady) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "휴대폰 인증을 완료한 뒤 아이디를 찾을 수 있습니다."
      }));
      return;
    }

    setLoginIdLookup((prev) => ({
      ...prev,
      status: "looking-up",
      message: "가입 정보를 확인하는 중입니다.",
      loginId: "",
      requestStatus: undefined
    }));

    try {
      const result = await onFindLoginId({
        name: loginIdLookup.name.trim(),
        phone: loginIdLookup.phone,
        phoneVerificationId: loginIdLookup.verificationId
      });

      setLoginIdLookup((prev) => ({
        ...prev,
        status: result.found && result.loginId ? "found" : "not-found",
        loginId: result.loginId ?? "",
        requestStatus: result.status,
        message:
          result.found && result.loginId
            ? result.status === "pending"
              ? "승인 대기 중인 계정입니다. 승인 후 로그인할 수 있습니다."
              : "가입 아이디를 찾았습니다."
            : "일치하는 가입 정보를 찾지 못했습니다."
      }));
    } catch (lookupError) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: lookupError instanceof Error ? lookupError.message : "아이디 찾기에 실패했습니다."
      }));
    }
  };

  const requestSignupPhoneVerification = async () => {
    if (!signupPhoneValid) {
      setSignupPhoneVerification((prev) => ({
        ...prev,
        status: "error",
        message: "휴대폰 번호를 먼저 올바르게 입력하세요."
      }));
      return;
    }

    setSignupPhoneVerification({
      phone: signupPhoneNormalized,
      verificationId: "",
      code: "",
      status: "sending",
      message: "인증번호를 보내는 중입니다."
    });

    try {
      const result = await onSendSignupPhoneVerification(signupForm.phone);
      setSignupPhoneVerification({
        phone: signupPhoneNormalized,
        verificationId: result.verificationId,
        code: result.devCode ?? "",
        status: "sent",
        message: result.devCode
          ? `개발용 인증번호 ${result.devCode}를 입력하세요.`
          : "인증번호를 보냈습니다. 5분 안에 입력하세요.",
        devCode: result.devCode
      });
    } catch (verificationError) {
      setSignupPhoneVerification({
        phone: signupPhoneNormalized,
        verificationId: "",
        code: "",
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 발송에 실패했습니다."
      });
    }
  };

  const confirmSignupPhoneVerification = async () => {
    if (!signupPhoneVerification.verificationId || signupPhoneVerification.code.trim().length !== 6) {
      setSignupPhoneVerification((prev) => ({
        ...prev,
        status: "error",
        message: "인증번호 6자리를 입력하세요."
      }));
      return;
    }

    setSignupPhoneVerification((prev) => ({
      ...prev,
      status: "verifying",
      message: "인증번호를 확인하는 중입니다."
    }));

    try {
      const verified = await onConfirmSignupPhoneVerification({
        verificationId: signupPhoneVerification.verificationId,
        phone: signupForm.phone,
        code: signupPhoneVerification.code
      });
      setSignupPhoneVerification((prev) => ({
        ...prev,
        status: verified ? "verified" : "error",
        message: verified ? "휴대폰 인증이 완료되었습니다." : "인증번호 확인에 실패했습니다."
      }));
    } catch (verificationError) {
      setSignupPhoneVerification((prev) => ({
        ...prev,
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 확인에 실패했습니다."
      }));
    }
  };

  const requestSignupEmailVerification = async () => {
    if (!signupEmailValid) {
      setSignupEmailVerification((prev) => ({
        ...prev,
        status: "error",
        message: "한전 수신메일을 먼저 올바르게 입력하세요."
      }));
      return;
    }

    setSignupEmailVerification({
      email: signupEmailNormalized,
      verificationId: "",
      code: "",
      status: "sending",
      message: "인증번호를 보내는 중입니다."
    });

    try {
      const result = await onSendSignupEmailVerification(signupForm.kepcoEmail);
      setSignupEmailVerification({
        email: signupEmailNormalized,
        verificationId: result.verificationId,
        code: result.devCode ?? "",
        status: "sent",
        message: result.devCode
          ? `개발용 인증번호 ${result.devCode}를 입력하세요.`
          : "인증번호를 보냈습니다. 5분 안에 입력하세요.",
        devCode: result.devCode
      });
    } catch (verificationError) {
      setSignupEmailVerification({
        email: signupEmailNormalized,
        verificationId: "",
        code: "",
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 발송에 실패했습니다."
      });
    }
  };

  const confirmSignupEmailVerification = async () => {
    if (!signupEmailVerification.verificationId || signupEmailVerification.code.trim().length !== 6) {
      setSignupEmailVerification((prev) => ({
        ...prev,
        status: "error",
        message: "인증번호 6자리를 입력하세요."
      }));
      return;
    }

    setSignupEmailVerification((prev) => ({
      ...prev,
      status: "verifying",
      message: "인증번호를 확인하는 중입니다."
    }));

    try {
      const verified = await onConfirmSignupEmailVerification({
        verificationId: signupEmailVerification.verificationId,
        email: signupForm.kepcoEmail,
        code: signupEmailVerification.code
      });
      setSignupEmailVerification((prev) => ({
        ...prev,
        status: verified ? "verified" : "error",
        message: verified ? "한전 수신메일 인증이 완료되었습니다." : "인증번호 확인에 실패했습니다."
      }));
    } catch (verificationError) {
      setSignupEmailVerification((prev) => ({
        ...prev,
        status: "error",
        message: verificationError instanceof Error ? verificationError.message : "인증번호 확인에 실패했습니다."
      }));
    }
  };

  const checkSignupLoginId = async () => {
    const loginId = signupForm.loginId.trim();
    const normalizedLoginId = loginId.toLowerCase();
    setSignupError("");

    if (!isValidLoginId(loginId)) {
      setSignupLoginIdAvailability({
        loginId: normalizedLoginId,
        status: "error",
        message: "영문/숫자로 시작하는 3~32자 ID를 입력하세요."
      });
      return;
    }

    latestSignupLoginIdRef.current = normalizedLoginId;
    setSignupLoginIdAvailability({
      loginId: normalizedLoginId,
      status: "checking",
      message: "중복 확인 중..."
    });

    try {
      const result = await onCheckLoginIdAvailability(loginId);
      if (latestSignupLoginIdRef.current !== result.loginId) {
        return;
      }

      setSignupLoginIdAvailability({
        loginId: result.loginId,
        status: result.available ? "available" : "duplicate",
        message: result.available ? "사용 가능한 아이디입니다." : "이미 사용중인 아이디입니다."
      });
    } catch {
      if (latestSignupLoginIdRef.current !== normalizedLoginId) {
        return;
      }
      setSignupLoginIdAvailability({
        loginId: normalizedLoginId,
        status: "error",
        message: "아이디 중복 확인에 실패했습니다. 잠시 후 다시 시도해주세요."
      });
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
      representativeName: signupForm.name,
      businessRegistrationNumber: normalizeBusinessRegistrationNumber(signupForm.businessRegistrationNumber),
      businessAddress: signupForm.businessAddress,
      businessType: signupForm.businessType,
      businessItem: signupForm.businessItem,
      name: signupForm.name,
      phone: signupForm.phone,
      phoneVerificationId: signupPhoneVerification.verificationId,
      kepcoEmail: signupForm.kepcoEmail,
      kepcoEmailVerificationId: signupEmailVerification.verificationId,
      invoiceEmail: signupForm.kepcoEmail,
      termsAccepted: signupForm.termsAccepted,
      privacyAccepted: signupForm.privacyAccepted,
      thirdPartyAccepted: signupForm.thirdPartyAccepted,
      marketingConsent: signupForm.marketingConsent
    });

    if (created) {
      setSignupForm(emptySignupForm);
      setSignupPhoneVerification({
        phone: "",
        verificationId: "",
        code: "",
        status: "idle",
        message: ""
      });
      setSignupEmailVerification({
        email: "",
        verificationId: "",
        code: "",
        status: "idle",
        message: ""
      });
      navigatePublicAuthMode("login");
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

        <main
          className={`portal-layout ${activeMode === "signup" ? "portal-layout-signup" : "portal-layout-login"}`}
          aria-label={activeMode === "signup" ? "AUTO-TAX 회원가입 신청" : "AUTO-TAX 로그인"}
        >
          {activeMode === "login" ? (
          <section className="auth-card portal-login-card portal-login-primary-card" id="public-login-card">
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
            <div className="portal-login-help-row">
              <button type="button" className="portal-mode-link" onClick={toggleLoginIdLookup}>
                {loginIdLookupOpen ? "아이디 찾기 닫기" : "아이디 찾기"}
              </button>
              <button type="button" className="portal-mode-link" onClick={togglePasswordReset}>
                {passwordResetOpen ? "비밀번호 찾기 닫기" : "비밀번호 찾기"}
              </button>
            </div>

            {loginIdLookupOpen ? (
              <form
                className="auth-form portal-password-reset-form portal-login-id-lookup-form"
                onSubmit={(event) => void submitLoginIdLookup(event)}
              >
                <label>
                  <span>대표자명</span>
                  <input
                    value={loginIdLookup.name}
                    onChange={(event) => updateLoginIdLookup("name", event.target.value)}
                    placeholder="대표자 이름"
                    autoComplete="name"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      loginIdLookupNameFilled && !loginIdLookupNameValid ? "portal-field-error" : ""
                    }`}
                  >
                    {loginIdLookupNameFilled && !loginIdLookupNameValid ? "한글 실명 2~20자로 입력하세요." : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>대표자 전화번호</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      value={loginIdLookup.phone}
                      onChange={(event) => updateLoginIdLookup("phone", event.target.value)}
                      placeholder="010-1234-5678"
                      autoComplete="tel"
                      required
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={authBusy || !loginIdLookupPhoneValid || loginIdLookup.status === "sending"}
                      onClick={() => void requestLoginIdLookupPhoneVerification()}
                    >
                      {loginIdLookup.status === "sending"
                        ? "발송 중"
                        : loginIdLookupPhoneVerified
                          ? "재전송"
                          : "인증번호"}
                    </button>
                  </div>
                  <span
                    className={`field-hint portal-password-hint ${
                      loginIdLookupPhoneFilled && !loginIdLookupPhoneValid
                        ? "portal-field-error"
                        : loginIdLookupPhoneVerified
                          ? "portal-field-ok"
                          : loginIdLookup.status === "error"
                            ? "portal-field-error"
                            : ""
                    }`}
                  >
                    {loginIdLookupPhoneFilled && !loginIdLookupPhoneValid
                      ? "휴대폰 번호 형식이 올바르지 않습니다."
                      : loginIdLookup.message && ["sending", "sent", "verifying", "verified", "error"].includes(loginIdLookup.status)
                        ? loginIdLookup.message
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>휴대폰 인증번호</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      value={loginIdLookup.code}
                      onChange={(event) => {
                        const code = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setLoginIdLookup((prev) => ({
                          ...prev,
                          code,
                          status: prev.status === "verified" ? "sent" : prev.status,
                          message: prev.status === "verified" ? "인증번호를 다시 확인해주세요." : prev.message,
                          loginId: "",
                          requestStatus: undefined
                        }));
                      }}
                      placeholder="6자리"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={!loginIdLookup.verificationId || loginIdLookupPhoneVerified}
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={
                        authBusy ||
                        loginIdLookupPhoneVerified ||
                        loginIdLookup.status === "verifying" ||
                        !loginIdLookup.verificationId ||
                        loginIdLookup.code.length !== 6
                      }
                      onClick={() => void confirmLoginIdLookupPhoneVerification()}
                    >
                      {loginIdLookup.status === "verifying" ? "확인 중" : loginIdLookupPhoneVerified ? "완료" : "확인"}
                    </button>
                  </div>
                </label>
                {loginIdLookup.status === "found" && loginIdLookup.loginId ? (
                  <div className="portal-login-id-result" role="status">
                    <span>가입 아이디</span>
                    <strong>{loginIdLookup.loginId}</strong>
                    <small>{loginIdLookup.message}</small>
                  </div>
                ) : loginIdLookup.message && ["looking-up", "not-found"].includes(loginIdLookup.status) ? (
                  <p className={`portal-password-reset-hint ${loginIdLookup.status === "not-found" ? "portal-field-error" : ""}`}>
                    {loginIdLookup.message}
                  </p>
                ) : null}
                <div className="auth-actions portal-login-actions">
                  <button type="submit" disabled={authBusy || !loginIdLookupReady || loginIdLookup.status === "looking-up"}>
                    {loginIdLookup.status === "looking-up" ? "확인 중..." : "아이디 찾기"}
                  </button>
                </div>
              </form>
            ) : null}

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

            <div className="portal-auth-switch">
              <span>계정이 없으신가요?</span>
              <button type="button" onClick={() => navigatePublicAuthMode("signup")}>
                회원가입 신청
              </button>
            </div>
          </section>
          ) : null}

          {activeMode === "signup" ? (
          <section className="auth-card portal-login-card portal-signup-card portal-login-primary-card" id="public-signup-card">
            <div className="portal-signup-head">
              <div className="auth-copy">
                <span className="auth-badge">회원가입</span>
                <p>{PUBLIC_PORTAL_COPY.signupDescription}</p>
              </div>
              <button type="button" className="portal-back-login" onClick={() => navigatePublicAuthMode("login")}>
                로그인으로 돌아가기
              </button>
            </div>

            <form className="auth-form portal-signup-form" onSubmit={(event) => void submitSignup(event)}>
              <div className="portal-signup-grid">
                <div className="portal-signup-section-title full">
                  <strong>계정 정보</strong>
                  <span>모든 항목 필수</span>
                </div>
                <label className="full">
                  <span>로그인 ID</span>
                  <div className="portal-login-id-control">
                    <input
                      value={signupForm.loginId}
                      onChange={(event) => updateSignupForm("loginId", event.target.value)}
                      placeholder="예: solaradmin"
                      autoComplete="username"
                      aria-describedby="public-signup-login-id-hint"
                      required
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={authBusy || signupLoginIdAvailability.status === "checking" || !signupLoginIdValid}
                      onClick={() => void checkSignupLoginId()}
                    >
                      {signupLoginIdAvailability.status === "checking" ? "확인 중" : "중복 검사"}
                    </button>
                  </div>
                  <span
                    id="public-signup-login-id-hint"
                    className={`field-hint portal-password-hint ${
                      signupLoginIdFilled && !signupLoginIdValid ? "portal-field-error" : signupLoginIdAvailabilityClass
                    }`}
                  >
                    {signupLoginIdFilled && !signupLoginIdValid
                      ? "영문/숫자로 시작하는 3~32자 ID를 입력하세요."
                      : signupLoginIdAvailabilityMessage
                        ? signupLoginIdAvailabilityMessage
                        : signupLoginIdValid
                          ? "중복 검사를 진행해주세요."
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
                <div className="portal-signup-section-title full">
                  <strong>대표자 정보</strong>
                  <span>휴대폰 인증 필수</span>
                </div>
                <label>
                  <span>대표자명</span>
                  <input
                    value={signupForm.name}
                    onChange={(event) => updateSignupForm("name", event.target.value)}
                    placeholder="예: 홍길동"
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
                <label className="row-start">
                  <span>대표자 전화번호</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      value={signupForm.phone}
                      onChange={(event) => updateSignupForm("phone", event.target.value)}
                      placeholder="010-1234-5678"
                      autoComplete="tel"
                      required
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={authBusy || !signupPhoneValid || signupPhoneVerification.status === "sending"}
                      onClick={() => void requestSignupPhoneVerification()}
                    >
                      {signupPhoneVerification.status === "sending" ? "발송 중" : signupPhoneVerified ? "재전송" : "인증번호"}
                    </button>
                  </div>
                  <span
                    className={`field-hint portal-password-hint ${
                      signupPhoneFilled && !signupPhoneValid
                        ? "portal-field-error"
                        : signupPhoneVerified
                          ? "portal-field-ok"
                          : signupPhoneVerification.status === "error"
                            ? "portal-field-error"
                            : ""
                    }`}
                  >
                    {signupPhoneFilled && !signupPhoneValid
                      ? "휴대폰 번호 형식이 올바르지 않습니다."
                      : signupPhoneVerification.message
                        ? signupPhoneVerification.message
                        : signupPhoneValid
                          ? "인증번호를 받아 휴대폰 인증을 완료하세요."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>휴대폰 인증번호</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      value={signupPhoneVerification.code}
                      onChange={(event) => {
                        const code = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setSignupPhoneVerification((prev) => ({
                          ...prev,
                          code,
                          status: prev.status === "verified" ? "sent" : prev.status,
                          message: prev.status === "verified" ? "인증번호를 다시 확인해주세요." : prev.message
                        }));
                      }}
                      placeholder="6자리"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={!signupPhoneVerification.verificationId || signupPhoneVerified}
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={
                        authBusy ||
                        signupPhoneVerified ||
                        signupPhoneVerification.status === "verifying" ||
                        !signupPhoneVerification.verificationId ||
                        signupPhoneVerification.code.length !== 6
                      }
                      onClick={() => void confirmSignupPhoneVerification()}
                    >
                      {signupPhoneVerification.status === "verifying" ? "확인 중" : signupPhoneVerified ? "완료" : "확인"}
                    </button>
                  </div>
                  <span className={`field-hint portal-password-hint ${signupPhoneVerified ? "portal-field-ok" : ""}`}>
                    {signupPhoneVerified ? "휴대폰 인증이 완료되었습니다." : "\u00a0"}
                  </span>
                </label>
                <label className="row-start">
                  <span>한전 수신메일</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      type="text"
                      inputMode="email"
                      aria-label="한전 수신메일"
                      value={signupForm.kepcoEmail}
                      onChange={(event) => updateSignupForm("kepcoEmail", event.target.value)}
                      placeholder="kepco@example.com"
                      autoComplete="email"
                      required
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={authBusy || !signupEmailValid || signupEmailVerification.status === "sending"}
                      onClick={() => void requestSignupEmailVerification()}
                    >
                      {signupEmailVerification.status === "sending" ? "발송 중" : signupEmailVerified ? "재전송" : "인증번호"}
                    </button>
                  </div>
                  <span
                    className={`field-hint portal-password-hint ${
                      signupEmailFilled && !signupEmailValid
                        ? "portal-field-error"
                        : signupEmailVerified
                          ? "portal-field-ok"
                          : signupEmailVerification.status === "error"
                            ? "portal-field-error"
                            : ""
                    }`}
                  >
                    {signupEmailFilled && !signupEmailValid
                      ? "메일 주소 형식이 올바르지 않습니다."
                      : signupEmailVerification.message
                        ? signupEmailVerification.message
                        : signupEmailValid
                          ? "인증번호를 받아 한전 수신메일 인증을 완료하세요."
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>한전 수신메일 인증번호</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      aria-label="한전 수신메일 인증번호"
                      value={signupEmailVerification.code}
                      onChange={(event) => {
                        const code = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setSignupEmailVerification((prev) => ({
                          ...prev,
                          code,
                          status: prev.status === "verified" ? "sent" : prev.status,
                          message: prev.status === "verified" ? "인증번호를 다시 확인해주세요." : prev.message
                        }));
                      }}
                      placeholder="6자리"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={!signupEmailVerification.verificationId || signupEmailVerified}
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={
                        authBusy ||
                        signupEmailVerified ||
                        signupEmailVerification.status === "verifying" ||
                        !signupEmailVerification.verificationId ||
                        signupEmailVerification.code.length !== 6
                      }
                      onClick={() => void confirmSignupEmailVerification()}
                    >
                      {signupEmailVerification.status === "verifying" ? "확인 중" : signupEmailVerified ? "완료" : "확인"}
                    </button>
                  </div>
                  <span className={`field-hint portal-password-hint ${signupEmailVerified ? "portal-field-ok" : ""}`}>
                    {signupEmailVerified ? "한전 수신메일 인증이 완료되었습니다." : "\u00a0"}
                  </span>
                </label>
                <div className="portal-signup-section-title full">
                  <strong>회사 / 세금계산서 정보</strong>
                  <span>사업자등록증 기준</span>
                </div>
                <label>
                  <span>상호명</span>
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
                      : "*사업자등록증상에 기재된 회사명을 입력해주세요"}
                  </span>
                </label>
                <label>
                  <span>사업자등록번호</span>
                  <input
                    value={signupForm.businessRegistrationNumber}
                    onChange={(event) => updateSignupForm("businessRegistrationNumber", event.target.value)}
                    placeholder="123-45-67890"
                    inputMode="numeric"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupBusinessNumberFilled && !signupBusinessNumberValid ? "portal-field-error" : signupBusinessNumberValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupBusinessNumberFilled && !signupBusinessNumberValid
                      ? "사업자등록번호 숫자 10자리를 입력하세요."
                      : signupBusinessNumberValid
                        ? "사업자등록번호 형식이 맞습니다."
                        : "\u00a0"}
                  </span>
                </label>
                <label className="full">
                  <span>사업장 주소</span>
                  <input
                    value={signupForm.businessAddress}
                    onChange={(event) => updateSignupForm("businessAddress", event.target.value)}
                    placeholder="사업자등록증상 사업장 주소"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupBusinessAddressFilled && !signupBusinessAddressValid ? "portal-field-error" : signupBusinessAddressValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupBusinessAddressFilled && !signupBusinessAddressValid
                      ? "사업장 주소를 5자 이상 입력하세요."
                      : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>업태</span>
                  <input
                    value={signupForm.businessType}
                    onChange={(event) => updateSignupForm("businessType", event.target.value)}
                    placeholder="예: 서비스업"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupBusinessTypeFilled && !signupBusinessTypeValid ? "portal-field-error" : signupBusinessTypeValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupBusinessTypeFilled && !signupBusinessTypeValid ? "업태를 2자 이상 입력하세요." : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>종목</span>
                  <input
                    value={signupForm.businessItem}
                    onChange={(event) => updateSignupForm("businessItem", event.target.value)}
                    placeholder="예: 전자세금계산서 자동화"
                    required
                  />
                  <span
                    className={`field-hint portal-password-hint ${
                      signupBusinessItemFilled && !signupBusinessItemValid ? "portal-field-error" : signupBusinessItemValid ? "portal-field-ok" : ""
                    }`}
                  >
                    {signupBusinessItemFilled && !signupBusinessItemValid ? "종목을 2자 이상 입력하세요." : "\u00a0"}
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

              {signupError || error ? (
                <div className="portal-feedback" aria-live="polite">
                  {signupError ? (
                    <div className="alert error" role="alert">
                      {signupError}
                    </div>
                  ) : null}
                  {error ? (
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
                >
                  {authBusy ? "신청 접수 중..." : "회원가입 신청"}
                </button>
              </div>
            </form>
          </section>
          ) : null}
        </main>

        <footer className="portal-footer" aria-label="AUTO-TAX 회사 및 정책 정보">
          <nav className="portal-footer-links" aria-label="정책 문서">
            <a href="#signup">서비스 이용약관</a>
            <a href="#signup">개인정보처리방침</a>
            <a href="#signup">개인정보 수집·이용 동의</a>
            <a href="#signup">처리위탁 및 제3자 제공 안내</a>
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
