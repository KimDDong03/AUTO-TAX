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
  badge: "고객 전용 접속 포털",
  title: "AUTO-TAX 고객 전용 접속",
  description: "계약이 완료된 고객사가 세금계산서 운영 작업공간에 로그인하는 화면입니다.",
  contactHint: "계정이 없거나 접속이 안 되면 담당 영업/운영자에게 요청하세요."
} as const;

export const PUBLIC_PORTAL_INFO_SECTIONS = [
  {
    eyebrow: '이 화면을 누가 쓰나요?',
    title: '계약 완료 고객사 담당자 전용',
    description:
      '영업 또는 운영 담당자로부터 로그인 계정을 전달받은 고객사 담당자가 접속하는 화면입니다.'
  },
  {
    eyebrow: '접속이 안 될 때',
    title: '담당 영업/운영자에게 바로 요청',
    description:
      '계정 발급, 권한 확인, 비밀번호 재설정 메일 재발송은 공개 셀프서비스 대신 담당 영업/운영자를 통해 안내합니다.'
  }
] as const satisfies readonly PublicPortalInfoSection[];

export const PUBLIC_PORTAL_FIRST_LOGIN_STEPS = [
  {
    title: '작업공간 접속 확인',
    description: '전달받은 계정으로 로그인해 내 고객사 작업공간이 맞는지 먼저 확인하세요.'
  },
  {
    title: '고객 등록·메일 연결 확인',
    description: '첫 운영 전에 고객 목록과 메일 수집 설정이 준비되어 있는지 점검하세요.'
  },
  {
    title: '인증서 준비 상태 확인',
    description: '세금계산서 발행에 필요한 인증서와 운영 준비 상태를 확인한 뒤 작업을 시작하세요.'
  }
] as const satisfies readonly PublicPortalFirstLoginStep[];
