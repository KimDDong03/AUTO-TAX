export type PublicPortalInfoSection = {
  eyebrow: string;
  title: string;
  description: string;
};

export type PublicPortalFirstLoginStep = {
  title: string;
  description: string;
};

export const PUBLIC_PORTAL_COPY = {
  badge: "도입 상담 신청",
  title: "AUTO-TAX 도입 상담 신청",
  description: "이름과 전화번호를 남기면 운영팀이 상담 후 작업공간과 첫 owner 계정을 개통합니다.",
  contactHint: "이미 계정을 받은 고객사는 아래 로그인 영역을 사용하세요.",
  loginTitle: "이미 계정이 있는 고객",
  loginDescription: "상담 후 전달받은 로그인 아이디와 비밀번호로 접속합니다."
} as const;

export const PUBLIC_PORTAL_INFO_SECTIONS = [
  {
    eyebrow: '도입 방식',
    title: '상담 후 운영자가 개통',
    description:
      '공개 화면에서 직접 계정을 만들지 않습니다. 상담 후 운영자가 작업공간과 owner 계정을 안전하게 준비합니다.'
  },
  {
    eyebrow: '메일 설정',
    title: '앱 비밀번호는 공개 폼에서 받지 않음',
    description:
      '메일 주소와 앱 비밀번호는 전화 또는 원격 상담 중 운영자가 별도로 설정하고 연결을 확인합니다.'
  }
] as const satisfies readonly PublicPortalInfoSection[];

export const PUBLIC_PORTAL_FIRST_LOGIN_STEPS = [
  {
    title: '상담 신청 접수',
    description: '이름과 연락 가능한 전화번호만 남깁니다.'
  },
  {
    title: '운영팀 설정',
    description: '상담 중 작업공간, owner 계정, 메일 연결을 운영자가 준비합니다.'
  },
  {
    title: '고객사 로그인',
    description: '전달받은 계정으로 접속해 고객 등록과 발행 준비 상태를 확인합니다.'
  }
] as const satisfies readonly PublicPortalFirstLoginStep[];
