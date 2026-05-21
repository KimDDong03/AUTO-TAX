import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Zap
} from "lucide-react";
import { ApiError, api } from "../../api";
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
  email: string;
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
  onFindLoginId: (input: { email: string; emailVerificationId: string }) => Promise<PublicLoginIdLookupResult>;
  onPasswordReset: (email: string) => Promise<boolean>;
};

type PublicAuthMode = "landing" | "login" | "signup";

const landingNavItems = ["서비스 소개", "기능", "서비스 과정", "요금 안내", "문의하기"];

const landingFeatures = [
  {
    icon: FileText,
    title: "세금계산서 원클릭 발행",
    description: "한전 이메일 데이터를 기반으로 세금계산서 초안을 자동 생성하고, 원클릭으로 간편하게 발행합니다."
  },
  {
    icon: UsersRound,
    title: "손쉬운 고객 관리",
    description: "고객별 발행 현황, 미발행 건, 오류 건을 한눈에 확인하고 관리할 수 있습니다."
  },
  {
    icon: BarChart3,
    title: "데이터 조회 및 분석",
    description: "발행 완료된 데이터를 기반으로 다양한 분석 리포트와 통계를 제공합니다."
  }
];

const landingSteps = [
  { icon: Mail, title: "이메일 수신", description: "한전에서 발송한 발전량 이메일을 시스템이 자동 수신" },
  { icon: FileText, title: "데이터 자동 추출", description: "이메일 내용을 분석하여 필요한 데이터를 자동 추출" },
  { icon: Sparkles, title: "세금계산서 자동 생성", description: "추출된 데이터로 세금계산서 초안을 자동 생성" },
  { icon: Send, title: "원클릭 발행", description: "확인 후 원클릭으로 발행 완료" }
];

const landingPlans = [
  ["0 ~ 100 고객사", "100,000원"],
  ["100 ~ 200 고객사", "200,000원"],
  ["200 ~ 300 고객사", "300,000원"],
  ["300 ~ 400 고객사", "400,000원"]
];

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
  email: "",
  verificationId: "",
  code: "",
  status: "idle",
  message: "",
  loginId: ""
};

const publicTerms: readonly PublicTerm[] = [
  {
    id: "termsAccepted",
    label: "서비스 이용약관",
    required: true,
    version: "terms_2026-05-13",
    sections: [
      {
        title: "제1조 목적",
        body: "본 약관은 키요(KIYO)(이하 “회사”)가 제공하는 세금계산서 자동 발행 지원 서비스 AUTO-TAX(이하 “서비스”)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 정함을 목적으로 합니다."
      },
      {
        title: "제2조 정의",
        items: [
          "“이용자”란 본 약관에 동의하고 서비스를 이용하는 개인 또는 사업자를 말합니다.",
          "“고객사”란 회사와 서비스 이용계약을 체결하거나 서비스 이용 승인을 받은 사업자를 말합니다.",
          "“담당자”란 고객사를 대표하거나 고객사를 대신하여 서비스를 이용하는 자를 말합니다.",
          "“외부 연동 서비스”란 전자세금계산서 발행, 문자 발송, 이메일 연동, 클라우드 운영 등을 위해 서비스와 연동되는 외부 시스템을 말합니다."
        ]
      },
      {
        title: "제3조 서비스의 성격",
        items: [
          "서비스는 한전 수신메일 분석, 고객 정보 관리, 전자세금계산서 발행 준비, 팝빌(Popbill) 연동, 발행 완료 알림, 인증서 및 계약 상태 관리 등을 지원하는 업무 보조 도구입니다.",
          "서비스는 세무, 회계, 법률 자문을 제공하는 서비스가 아니며, 세금계산서 발행 여부와 발행 내용에 대한 최종 확인 책임은 이용자에게 있습니다.",
          "회사는 이용자가 입력하거나 승인한 정보, 연동된 외부 시스템의 응답, 이용자가 부여한 권한 범위 내에서 서비스를 제공합니다."
        ]
      },
      {
        title: "제4조 계정 및 이용 승인",
        items: [
          "서비스 이용을 위해 이용자는 회사가 요구하는 정보를 정확하게 제공하여야 합니다.",
          "회사는 운영상 필요, 보안상 위험, 정보 불명확, 권한 확인 불가 등의 사유가 있는 경우 가입 신청을 보류하거나 거절할 수 있습니다.",
          "이용자는 본인의 계정, 비밀번호, 이메일 계정, 인증정보 등을 안전하게 관리하여야 하며, 관리 소홀로 발생한 손해는 이용자가 부담합니다."
        ]
      },
      {
        title: "제5조 세금계산서 발행 위탁 및 권한",
        items: [
          "이용자는 서비스 이용 과정에서 회사에 전자세금계산서 발행 준비 또는 발행 관련 업무를 위탁할 수 있습니다.",
          "이용자는 세금계산서 발행 업무를 수행하거나 회사에 위탁할 적법한 권한을 보유하여야 합니다.",
          "회사는 이용자가 제공한 정보와 권한 범위 내에서 발행 업무를 수행하며, 이용자가 제공한 정보의 오류, 누락, 권한 부족으로 발생한 문제에 대해서는 책임을 부담하지 않습니다.",
          "회사는 서비스 오류, 시스템 장애, 외부 연동 실패 등 발행에 영향을 줄 수 있는 사유를 확인한 경우 합리적인 범위 내에서 이용자에게 알리고 복구 또는 재처리를 지원합니다."
        ]
      },
      {
        title: "제6조 외부 연동 서비스",
        items: [
          "서비스는 전자세금계산서 발행, 문자 발송, 이메일 수신, 클라우드 운영 등을 위해 팝빌, 이용자가 설정한 이메일 서비스, 클라우드 서비스 등 외부 시스템과 연동될 수 있습니다.",
          "외부 연동 서비스의 장애, 정책 변경, 점검, 응답 오류로 인해 서비스 일부가 지연되거나 제한될 수 있습니다.",
          "회사의 귀책사유 없이 외부 연동 서비스에서 발생한 장애 또는 오류로 인한 손해에 대해서는 회사가 책임을 부담하지 않습니다."
        ]
      },
      {
        title: "제7조 데이터 처리 및 보관",
        items: [
          "회사는 서비스 제공을 위해 고객사 정보, 담당자 정보, 거래처 정보, 발행 요청 및 처리 이력, 서비스 이용 기록 등을 저장·처리할 수 있습니다.",
          "회사는 원본 공동인증서 파일, 공동인증서 비밀번호, 홈택스 로그인 정보 등 민감한 인증정보를 원칙적으로 서버에 저장하지 않습니다.",
          "이메일 연동에 필요한 앱비밀번호 등 일부 인증정보는 서비스 제공을 위해 필요한 경우 암호화 또는 마스킹 처리하여 저장될 수 있습니다.",
          "이용자는 서비스 이용과 관련하여 필요한 원본 자료, 증빙, 회계 자료를 별도로 보관·관리할 책임이 있습니다."
        ]
      },
      {
        title: "제8조 이용자의 의무",
        items: [
          "허위 또는 부정확한 정보 입력",
          "권한 없이 타인의 사업자 정보, 담당자 정보, 인증정보 사용",
          "관련 법령을 위반하는 세금계산서 발행 요청",
          "서비스의 정상 운영을 방해하는 행위",
          "회사 또는 제3자의 권리, 정보, 영업상 이익을 침해하는 행위"
        ]
      },
      {
        title: "제9조 이용요금 및 결제",
        items: [
          "서비스는 월 단위 또는 연 단위 구독 형태로 제공될 수 있습니다.",
          "이용요금, 결제일, 제공 범위는 회사가 별도로 정한 정책 또는 개별 계약에 따릅니다.",
          "이용자가 이용요금을 기한 내 납부하지 않을 경우 회사는 서비스 이용을 제한하거나 계약을 해지할 수 있습니다."
        ]
      },
      {
        title: "제10조 환불 및 해지",
        items: [
          "이용자는 언제든지 서비스 해지를 요청할 수 있습니다.",
          "월 구독의 경우 해지 시 다음 결제일부터 서비스 이용이 중단됩니다.",
          "연 구독의 경우 계약 기간 중 해지하더라도 이미 제공된 기간 또는 계약상 정한 조건에 따라 환불이 제한될 수 있습니다.",
          "다만 관계 법령에서 청약철회, 환불 또는 손해배상을 인정하는 경우에는 해당 법령에 따릅니다."
        ]
      },
      {
        title: "제11조 서비스 변경 및 중단",
        items: [
          "회사는 안정적인 서비스 제공을 위해 노력합니다.",
          "회사는 운영상 필요, 보안상 위험, 외부 서비스 정책 변경, 시스템 점검 등의 사유로 서비스의 일부 또는 전부를 변경하거나 일시 중단할 수 있습니다.",
          "회사는 중대한 변경 또는 장기간 중단이 예상되는 경우 가능한 방법으로 이용자에게 사전 또는 사후 안내합니다."
        ]
      },
      {
        title: "제12조 책임 제한",
        items: [
          "회사는 회사의 고의 또는 중대한 과실로 인해 이용자에게 손해가 발생한 경우 관계 법령에 따라 책임을 부담합니다.",
          "회사는 이용자가 제공한 정보의 오류 또는 누락, 이용자의 권한 부족 또는 부정한 권한 사용, 외부 연동 서비스의 장애, 오류, 정책 변경, 이용자의 계정, 이메일, 인증정보 관리 소홀, 천재지변, 통신 장애, 클라우드 장애 등 회사가 합리적으로 통제하기 어려운 사유로 발생한 손해에 대해서는 회사의 귀책사유가 없는 한 책임을 부담하지 않습니다.",
          "회사는 세금계산서 발행 결과의 세무상 적정성, 회계상 판단, 법률상 효과를 보증하지 않습니다."
        ]
      },
      {
        title: "제13조 비밀유지",
        body: "회사는 서비스 제공 과정에서 알게 된 이용자의 정보를 정당한 사유 없이 외부에 공개하거나 제3자에게 제공하지 않습니다. 다만 이용자의 동의가 있거나 법령상 의무가 있는 경우는 예외로 합니다."
      },
      {
        title: "제14조 계약 종료 후 처리",
        items: [
          "서비스 이용 종료 시 회사는 서비스 제공을 위해 보유하던 정보를 관계 법령 및 회사 정책에 따라 파기합니다.",
          "다만 법령상 보관이 필요한 정보는 해당 기간 동안 보관할 수 있습니다.",
          "이용자는 계약 종료 전 필요한 자료를 사전에 확보하여야 합니다."
        ]
      },
      {
        title: "제15조 준거법 및 관할",
        body: "본 약관은 대한민국 법을 따르며, 분쟁 발생 시 민사소송법 등 관련 법령에 따른 관할 법원을 관할 법원으로 합니다."
      },
      {
        title: "제16조 시행일",
        body: "본 약관은 2026년 5월 13일부터 시행합니다."
      },
      {
        title: "동의 확인",
        body: "본인은 위 서비스 이용약관을 확인하고 이에 동의합니다."
      }
    ]
  },
  {
    id: "privacyAccepted",
    label: "개인정보 수집·이용 동의 및 처리위탁 안내",
    required: true,
    version: "privacy_processing_2026-05-13",
    sections: [
      {
        title: "제1조 수집 항목",
        items: [
          "계정 정보: 로그인 ID, 비밀번호 또는 비밀번호 해시, 가입 신청일, 승인 상태",
          "담당자 정보: 담당자명, 이메일, 전화번호",
          "고객사 정보: 고객사명, 사업자등록번호, 대표자명, 사업장 정보",
          "서비스 이용 정보: 접속 기록, 이용 기록, 설정 정보, 발행 요청 및 처리 이력, 오류 로그",
          "전자세금계산서 업무 정보: 거래처 정보, 발전소명, 거래 금액, 공급가액, 부가세, 발행일, 발행 결과",
          "이메일 연동 정보: 이용자가 등록한 이메일 주소, IMAP 연동에 필요한 정보",
          "알림 발송 정보: 문자 수신번호, 발행 완료 알림 내용, 발송 결과",
          "회사는 원본 공동인증서 파일, 공동인증서 비밀번호, 홈택스 로그인 정보 등 민감한 인증정보를 원칙적으로 서버에 저장하지 않습니다. 다만 서비스 제공에 필요한 일부 연동 인증정보는 암호화 또는 마스킹 처리하여 저장될 수 있습니다."
        ]
      },
      {
        title: "제2조 이용 목적",
        items: [
          "회원가입 신청 접수, 본인 및 담당자 확인",
          "계정 생성, 로그인, 작업공간 관리",
          "고객사 및 거래처 관리",
          "한전 수신메일 조회 및 분석",
          "전자세금계산서 발행 준비, 발행 요청, 발행 결과 확인",
          "발행 완료 문자 알림 발송",
          "고객 문의 대응 및 서비스 운영 지원",
          "보안 관리, 장애 대응, 부정 이용 방지",
          "요금 정산, 계약 관리, 법령상 의무 이행"
        ]
      },
      {
        title: "제3조 보유 및 이용 기간",
        items: [
          "개인정보는 서비스 이용 기간 동안 보유·이용됩니다.",
          "이용자가 탈퇴하거나 계약이 종료된 경우 회사는 지체 없이 개인정보를 파기합니다.",
          "다만 관계 법령상 보관이 필요한 정보는 해당 법령에서 정한 기간 동안 보관할 수 있습니다.",
          "서비스 운영 로그, 오류 기록, 보안 기록은 장애 대응, 분쟁 대응, 부정 이용 방지를 위해 필요한 범위에서 일정 기간 보관될 수 있습니다."
        ]
      },
      {
        title: "제4조 개인정보 처리위탁 안내",
        items: [
          "Supabase: 회원 인증, 데이터베이스 운영, 서비스 데이터 보관",
          "Vercel: 웹 서비스 배포, API 실행, 접속 로그 처리",
          "팝빌(Popbill): 발행 완료 문자 발송",
          "이용자가 설정한 이메일 서비스 제공자: 한전 수신메일 조회를 위한 IMAP 연동",
          "이용자가 설정한 이메일 서비스 제공자는 이용자가 직접 선택한 메일 서비스 제공자를 의미하며, 예를 들어 네이버, Google, 카카오/다음 등일 수 있습니다. 해당 이메일 서비스 자체의 개인정보 처리 및 보관은 이용자가 선택한 이메일 서비스 제공자의 정책을 따릅니다.",
          "회사는 수탁자가 위탁받은 업무 목적 외 개인정보를 처리하지 않도록 관리·감독합니다. 위탁업무 또는 수탁자가 변경되는 경우 서비스 화면, 이메일, 공지사항 등 합리적인 방법으로 안내할 수 있습니다."
        ]
      },
      {
        title: "제5조 동의 거부 권리",
        body: "이용자는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다. 다만 필수 정보에 대한 동의를 거부하는 경우 회원가입, 작업공간 개설, 전자세금계산서 발행 지원 등 서비스 이용이 제한될 수 있습니다."
      },
      {
        title: "동의 확인",
        body: "본인은 위 개인정보 수집·이용에 동의하며, 서비스 제공을 위한 개인정보 처리위탁 내용을 확인했습니다."
      }
    ]
  },
  {
    id: "thirdPartyAccepted",
    label: "개인정보 제3자 제공 동의서",
    required: true,
    version: "third_party_2026-05-13",
    sections: [
      {
        title: "제1조 제공받는 자",
        items: [
          "팝빌(Popbill)",
          "국세청 등 전자세금계산서 발행·전송과 관련된 법령상 기관"
        ]
      },
      {
        title: "제2조 제공 목적",
        items: [
          "전자세금계산서 발행",
          "전자세금계산서 국세청 전송",
          "발행 결과 확인",
          "전자세금계산서 취소, 수정, 재발행 등 후속 처리",
          "팝빌 회원 가입, 인증서 등록, 거래처 상태 확인 등 발행 연동에 필요한 업무"
        ]
      },
      {
        title: "제3조 제공 항목",
        items: [
          "고객사 정보: 고객사명, 사업자등록번호, 대표자명, 사업장 정보, 업태, 종목",
          "담당자 정보: 담당자명, 이메일, 전화번호",
          "거래 정보: 거래처 정보, 공급가액, 부가세, 합계금액, 발행일, 품목 정보",
          "발행 처리 정보: 발행 요청 정보, 발행 결과, 승인번호, 오류 내역",
          "전자세금계산서 발행 연동에 필요한 식별 정보"
        ]
      },
      {
        title: "제4조 보유 및 이용 기간",
        body: "제3자는 제공 목적 달성 시까지 개인정보를 보유·이용합니다. 다만 전자세금계산서, 세무, 회계, 전자문서 관련 법령 또는 해당 제3자의 법적 의무에 따라 보관이 필요한 경우에는 해당 기간 동안 보관할 수 있습니다."
      },
      {
        title: "제5조 동의 거부 권리",
        body: "이용자는 개인정보 제3자 제공에 대한 동의를 거부할 권리가 있습니다. 다만 본 동의는 전자세금계산서 발행, 국세청 전송, 팝빌 연동 등 서비스 핵심 기능 제공에 필요한 사항이므로 동의를 거부할 경우 서비스 이용이 제한될 수 있습니다."
      },
      {
        title: "제6조 제공 시점",
        body: "개인정보는 이용자가 서비스 이용을 신청하거나, 전자세금계산서 발행 기능을 이용하거나, 회사에 발행 관련 업무를 위탁하는 경우 필요한 범위 내에서 제공됩니다."
      },
      {
        title: "동의 확인",
        body: "본인은 위 개인정보 제3자 제공에 동의합니다."
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

function LandingDashboardPreview() {
  return (
    <div className="landing-dashboard-preview">
      <div className="landing-dashboard-topbar">
        <div>
          <span>
            <Zap size={14} aria-hidden="true" />
            AUTO-TAX
          </span>
          <span>대시보드</span>
          <span>고객</span>
          <span>발행</span>
          <span>조회</span>
        </div>
        <strong>+ 발행</strong>
      </div>
      <div className="landing-dashboard-body">
        <p>My dashboard · March 2024</p>
        <div className="landing-stat-grid">
          {[
            ["이번 달 발행 건수", "1,248"],
            ["이번 달 공급가액", "₩124.8M"],
            ["발행 대기", "32"]
          ].map(([label, value]) => (
            <div key={label} className="landing-stat-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="landing-preview-grid">
          <div className="landing-chart-card">
            <div className="landing-card-head">
              <strong>월별 공급가액</strong>
              <span>고단 태양광</span>
            </div>
            <div className="landing-chart">
              {[0, 1, 2, 3].map((index) => (
                <i key={index} style={{ bottom: `${index * 33}%` }} />
              ))}
              <svg viewBox="0 0 280 112" aria-hidden="true" focusable="false">
                <path d="M8 92 C42 84, 52 60, 84 56 S128 70, 156 45 S218 50, 270 22" />
                {[8, 84, 156, 220, 270].map((x, index) => (
                  <circle key={x} cx={x} cy={[92, 56, 45, 50, 22][index]} r="2.5" />
                ))}
              </svg>
            </div>
          </div>
          <div className="landing-list-card">
            <strong>최근 발행 내역</strong>
            <ul>
              {["(주)OO에너지", "태양광회사(주)", "OO솔라(주)", "ABC파워"].map((item) => (
                <li key={item}>
                  <span>{item}</span>
                  <time>2024-05-24</time>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactInquiryModal({ onClose }: { onClose: () => void }) {
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendMessage, setSendMessage] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const consent = formData.get("consent");

    if (!consent) {
      setSendStatus("error");
      setSendMessage("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    const category = String(formData.get("category") ?? "기타 문의");
    const message = String(formData.get("message") ?? "");
    const email = String(formData.get("email") ?? "");
    const name = String(formData.get("name") ?? "");
    const phone = String(formData.get("phone") ?? "");

    setSendStatus("sending");
    setSendMessage("");

    try {
      await api<{ ok: boolean }>("/api/public/contact-inquiries", {
        method: "POST",
        body: JSON.stringify({
          category,
          message,
          email,
          name,
          phone,
          consent: true
        })
      });
      setSendStatus("sent");
      setSendMessage("문의가 접수되었습니다. 영업일 기준 24시간 이내에 연락드리겠습니다.");
      form.reset();
    } catch (error) {
      setSendStatus("error");
      setSendMessage(error instanceof ApiError ? error.message : "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div className="landing-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="landing-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-contact-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="landing-modal-close" aria-label="문의 창 닫기" onClick={onClose}>
          ×
        </button>
        <form onSubmit={handleSubmit} className="landing-contact-form">
          <div className="landing-modal-head">
            <span>
              <MessageCircle size={20} aria-hidden="true" />
            </span>
            <h2 id="landing-contact-title">무엇을 도와드릴까요?</h2>
            <p>영업일 기준 24시간 이내에 답변드리겠습니다.</p>
          </div>

          <label>
            <span>문의 카테고리</span>
            <select name="category" defaultValue="요금제 문의">
              <option>요금제 문의</option>
              <option>서비스 문의</option>
              <option>기타 문의</option>
            </select>
          </label>

          <label>
            <span>문의 내용</span>
            <textarea
              name="message"
              required
              rows={5}
              placeholder="예: 태양광 고객사 세금계산서 발행 자동화 도입을 검토하고 있습니다."
            />
          </label>

          <label>
            <span>이메일</span>
            <input name="email" type="email" required placeholder="your@example.com" />
          </label>

          <label>
            <span>이름 / 회사명</span>
            <input name="name" required placeholder="이름 또는 회사명" autoComplete="organization" />
          </label>

          <label>
            <span>담당자 연락처</span>
            <input name="phone" type="tel" required placeholder="010-1234-5678" autoComplete="tel" />
          </label>

          <label className="landing-consent-box">
            <input type="checkbox" name="consent" required />
            <span>
              <strong>[필수]</strong> 개인정보 수집·이용에 동의합니다.
              <small>수집 항목: 이메일, 이름/회사명, 담당자 연락처 · 이용 목적: 문의 응대 · 보유 기간: 문의 처리 완료 후 1년</small>
            </span>
          </label>

          {sendMessage ? (
            <p className={`landing-modal-message ${sendStatus === "error" ? "error" : "success"}`} role={sendStatus === "error" ? "alert" : "status"}>
              {sendMessage}
            </p>
          ) : null}

          <button type="submit" className="landing-modal-submit" disabled={sendStatus === "sending"}>
            {sendStatus === "sending" ? "문의 접수 중..." : "문의 보내기"}
          </button>
        </form>
      </div>
    </div>
  );
}

function getPublicAuthModeFromHash(): PublicAuthMode {
  if (typeof window === "undefined") {
    return "landing";
  }

  const rawHash = window.location.hash;
  const decodedHash = (() => {
    try {
      return decodeURIComponent(rawHash);
    } catch {
      return rawHash;
    }
  })();

  if (decodedHash === "#login" || decodedHash === "#public-login-card") {
    return "login";
  }

  if (decodedHash === "#signup" || decodedHash === "#public-signup-card") {
    return "signup";
  }

  return "landing";
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
  const [contactModalOpen, setContactModalOpen] = useState(false);
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

  const navigatePublicAuthMode = (mode: Exclude<PublicAuthMode, "landing">) => {
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

  const openContactModal = () => setContactModalOpen(true);
  const closeContactModal = () => setContactModalOpen(false);

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
  const loginIdLookupEmailFilled = loginIdLookup.email.trim().length > 0;
  const loginIdLookupEmailValid = isValidEmail(loginIdLookup.email);
  const loginIdLookupEmailNormalized = loginIdLookup.email.trim().toLowerCase();
  const loginIdLookupEmailVerified =
    loginIdLookup.status === "verified" &&
    loginIdLookup.email === loginIdLookupEmailNormalized &&
    loginIdLookup.verificationId.length > 0;
  const loginIdLookupReady = loginIdLookupEmailValid && loginIdLookupEmailVerified;

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

      if (key === "email") {
        return {
          ...next,
          email: String(value).trim().toLowerCase(),
          verificationId: "",
          code: "",
          status: "idle",
          message: "",
          loginId: "",
          requestStatus: undefined,
          devCode: undefined
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

  const requestLoginIdLookupEmailVerification = async () => {
    if (!loginIdLookupEmailValid) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "한전 수신메일을 먼저 올바르게 입력하세요."
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
      const result = await onSendSignupEmailVerification(loginIdLookup.email);
      setLoginIdLookup((prev) => ({
        ...prev,
        email: loginIdLookupEmailNormalized,
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

  const confirmLoginIdLookupEmailVerification = async () => {
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
      const verified = await onConfirmSignupEmailVerification({
        verificationId: loginIdLookup.verificationId,
        email: loginIdLookup.email,
        code: loginIdLookup.code
      });
      setLoginIdLookup((prev) => ({
        ...prev,
        status: verified ? "verified" : "error",
        message: verified ? "한전 수신메일 인증이 완료되었습니다." : "인증번호 확인에 실패했습니다."
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

    if (!loginIdLookupEmailValid) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "가입 시 입력한 한전 수신메일을 입력하세요."
      }));
      return;
    }

    if (!loginIdLookupReady) {
      setLoginIdLookup((prev) => ({
        ...prev,
        status: "error",
        message: "한전 수신메일 인증을 완료한 뒤 아이디를 찾을 수 있습니다."
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
        email: loginIdLookup.email,
        emailVerificationId: loginIdLookup.verificationId
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
        <header className="landing-header">
          <nav className="landing-nav" aria-label="AUTO-TAX 공개 페이지">
            <a href="#서비스-소개" className="portal-brand landing-brand" aria-label="AUTO-TAX 서비스 소개로 이동">
              <img src="/logo-O2APlXk3.png" alt="AUTO-TAX" className="portal-brand-logo" />
            </a>
            <div className="landing-nav-links">
              {landingNavItems.map((item) =>
                item === "문의하기" ? (
                  <button key={item} type="button" className="landing-nav-link-button" onClick={openContactModal}>
                    {item}
                  </button>
                ) : (
                  <a key={item} href={`#${item.replaceAll(" ", "-")}`}>
                    {item}
                  </a>
                )
              )}
            </div>
            <div className="landing-nav-actions">
              <button type="button" className="landing-nav-login" onClick={() => navigatePublicAuthMode("login")}>
                로그인
              </button>
              <button type="button" className="landing-nav-cta" onClick={() => navigatePublicAuthMode("signup")}>
                데모 사용 신청
              </button>
            </div>
          </nav>
        </header>

        {activeMode === "landing" ? (
          <div className="landing-page">
            <section id="서비스-소개" className="landing-hero">
              <div className="landing-hero-copy">
                <p className="landing-pill">태양광 회사를 위한 세금계산서 자동화 솔루션</p>
                <h1>
                  세금계산서 <span>원클릭 발행</span>,
                  <br />
                  고객관리도 손쉽게
                </h1>
                <p className="landing-lead">
                  한전 이메일 자동 수집부터 세금계산서 발행, 고객 관리까지 AUTO-TAX가 모두 자동으로 처리해 드립니다.
                </p>
                <div className="landing-hero-actions">
                  <button type="button" className="landing-primary-action" onClick={openContactModal}>
                    도입 문의하기
                  </button>
                  <button type="button" className="landing-secondary-action" onClick={() => navigatePublicAuthMode("signup")}>
                    데모 사용 신청 <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="landing-proof-grid">
                  {[
                    [Zap, "원클릭 발행", "이메일 데이터로 자동 생성"],
                    [UsersRound, "손쉬운 고객관리", "발행 현황을 한눈에"],
                    [ShieldCheck, "정확하고 안전하게", "검증 및 보안 처리"]
                  ].map(([Icon, title, description]) => {
                    const IconComponent = Icon as typeof Zap;
                    return (
                      <div key={title as string} className="landing-proof-item">
                        <span>
                          <IconComponent size={17} aria-hidden="true" />
                        </span>
                        <div>
                          <strong>{title as string}</strong>
                          <small>{description as string}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <LandingDashboardPreview />
            </section>

            <section id="기능" className="landing-section landing-muted-section">
              <div className="landing-section-inner">
                <div className="landing-section-title">
                  <span>Features</span>
                  <h2>AUTO-TAX가 제공하는 핵심 기능</h2>
                </div>
                <div className="landing-card-grid landing-three-grid">
                  {landingFeatures.map(({ icon: Icon, title, description }) => (
                    <article key={title} className="landing-feature-card">
                      <span>
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section id="서비스-과정" className="landing-section">
              <div className="landing-section-inner">
                <div className="landing-section-title">
                  <span>How it works</span>
                  <h2>AUTO-TAX 서비스 과정</h2>
                </div>
                <div className="landing-card-grid landing-four-grid">
                  {landingSteps.map(({ icon: Icon, title, description }, index) => (
                    <article key={title} className="landing-step-card">
                      <div>
                        <span>
                          <Icon size={22} aria-hidden="true" />
                        </span>
                        <strong>0{index + 1}</strong>
                      </div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section id="요금-안내" className="landing-section landing-muted-section">
              <div className="landing-section-inner">
                <div className="landing-section-title">
                  <span>Pricing</span>
                  <h2>합리적인 요금제로 시작하세요</h2>
                </div>
                <div className="landing-card-grid landing-four-grid">
                  {landingPlans.map(([range, price]) => (
                    <article key={range} className="landing-plan-card">
                      <p>{range}</p>
                      <strong>
                        {price}
                        <span> / 월</span>
                      </strong>
                      <div>
                        <CheckCircle2 size={16} aria-hidden="true" />
                        기본 기능 모두 포함
                      </div>
                    </article>
                  ))}
                </div>
                <p className="landing-pricing-note">부가세 별도 · 연 구독 시 1개월 무료 지원</p>
                <p className="landing-pricing-note">400 고객사 이상 또는 맞춤형 플랜은 별도 문의</p>
              </div>
            </section>

            <section id="문의하기" className="landing-contact">
              <div>
                <h2>AUTO-TAX와 함께 업무 효율을 높여보세요.</h2>
                <p>지금 바로 도입 문의하거나 데모를 신청하세요.</p>
              </div>
              <div>
                <button type="button" className="landing-primary-action" onClick={openContactModal}>
                  <MessageCircle size={16} aria-hidden="true" />
                  도입 문의하기
                </button>
                <button type="button" className="landing-secondary-action" onClick={() => navigatePublicAuthMode("signup")}>
                  데모 사용 신청 <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {contactModalOpen ? <ContactInquiryModal onClose={closeContactModal} /> : null}

        {activeMode !== "landing" ? (
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
                  <span>한전 수신메일</span>
                  <div className="portal-login-id-control portal-phone-verification-control">
                    <input
                      type="email"
                      value={loginIdLookup.email}
                      onChange={(event) => updateLoginIdLookup("email", event.target.value)}
                      placeholder="kepco@example.com"
                      autoComplete="email"
                      required
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={authBusy || !loginIdLookupEmailValid || loginIdLookup.status === "sending"}
                      onClick={() => void requestLoginIdLookupEmailVerification()}
                    >
                      {loginIdLookup.status === "sending"
                        ? "발송 중"
                        : loginIdLookupEmailVerified
                          ? "재전송"
                          : "인증번호"}
                    </button>
                  </div>
                  <span
                    className={`field-hint portal-password-hint ${
                      loginIdLookupEmailFilled && !loginIdLookupEmailValid
                        ? "portal-field-error"
                        : loginIdLookupEmailVerified
                          ? "portal-field-ok"
                          : loginIdLookup.status === "error"
                            ? "portal-field-error"
                            : ""
                    }`}
                  >
                    {loginIdLookupEmailFilled && !loginIdLookupEmailValid
                      ? "이메일 형식이 올바르지 않습니다."
                      : loginIdLookup.message && ["sending", "sent", "verifying", "verified", "error"].includes(loginIdLookup.status)
                        ? loginIdLookup.message
                        : "\u00a0"}
                  </span>
                </label>
                <label>
                  <span>한전 수신메일 인증번호</span>
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
                      disabled={!loginIdLookup.verificationId || loginIdLookupEmailVerified}
                    />
                    <button
                      type="button"
                      className="portal-login-id-check"
                      disabled={
                        authBusy ||
                        loginIdLookupEmailVerified ||
                        loginIdLookup.status === "verifying" ||
                        !loginIdLookup.verificationId ||
                        loginIdLookup.code.length !== 6
                      }
                      onClick={() => void confirmLoginIdLookupEmailVerification()}
                    >
                      {loginIdLookup.status === "verifying" ? "확인 중" : loginIdLookupEmailVerified ? "완료" : "확인"}
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
        ) : null}

        <footer className="portal-footer" aria-label="AUTO-TAX 회사 및 정책 정보">
          <nav className="portal-footer-links" aria-label="정책 문서">
            <a href="#signup">서비스 이용약관</a>
            <a href="#signup">개인정보 수집·이용 및 처리위탁 안내</a>
            <a href="#signup">개인정보 제3자 제공 동의서</a>
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
