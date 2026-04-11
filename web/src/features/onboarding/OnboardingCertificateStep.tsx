import { SurfaceCard } from "../../components/ui";
import type { Customer } from "../../types";

type PendingCertificateTarget = Pick<Customer, "id" | "customerName" | "corpName" | "businessNumber" | "popbillCertExpireDate">;

type OnboardingCertificateStepProps = {
  busyKey: string | null;
  pendingTargets: PendingCertificateTarget[];
  linkedCertificateCount: number;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  proceedOnboardingCertificateRegistration: () => Promise<void>;
  openCertificatesTab: () => void;
  formatCertificateExpireDate: (value: string | null) => string;
};

function formatBusinessNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) {
    return value || "-";
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function OnboardingCertificateStep(props: OnboardingCertificateStepProps) {
  const isProceeding = props.busyKey === "customer-onboarding-cert-registration";
  const hasPendingTargets = props.pendingTargets.length > 0;

  return (
    <div className="stitch-onboarding-cert-step">
      <SurfaceCard className={hasPendingTargets ? "stitch-onboarding-cert-hero" : "stitch-onboarding-cert-hero is-complete"}>
        <div className="stitch-onboarding-step-header">
          <div className="stitch-onboarding-step-header-copy">
            <div className="stitch-onboarding-step-header-top">
              <span className={hasPendingTargets ? "chip chip-warn" : "chip chip-success"}>
                {hasPendingTargets ? `${props.pendingTargets.length}건 남음` : "연결 완료"}
              </span>
            </div>
            <h2>전자세금용 인증서 연결</h2>
            <p>
              엑셀 고객 등록 단계에서 가져온 전자세금용 인증서 정보를 기준으로, 팝빌 가입까지 끝난 고객의 인증서 연결만
              이어서 마무리합니다.
            </p>
          </div>
          <div className="stitch-onboarding-step-header-actions">
            {hasPendingTargets ? (
              <button
                type="button"
                className="stitch-onboarding-primary-button"
                disabled={props.busyKey !== null}
                onClick={() =>
                  void props.runAction(
                    "customer-onboarding-cert-registration",
                    props.proceedOnboardingCertificateRegistration,
                    { reload: false }
                  )
                }
              >
                {isProceeding ? "자동 등록 중..." : "남은 인증서 자동 등록"}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={props.openCertificatesTab}>
              인증서 관리 열기
            </button>
          </div>
        </div>
      </SurfaceCard>

      <div className="stitch-onboarding-cert-metrics">
        <SurfaceCard className="stitch-onboarding-cert-metric">
          <span>연결 완료</span>
          <strong>{props.linkedCertificateCount}건</strong>
          <p>고객과 연결된 인증서 기준입니다.</p>
        </SurfaceCard>
        <SurfaceCard className="stitch-onboarding-cert-metric">
          <span>남은 연결</span>
          <strong>{props.pendingTargets.length}건</strong>
          <p>팝빌 가입은 끝났지만 전자세금용 인증서 등록이 남은 고객입니다.</p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="stitch-onboarding-cert-list-card">
        <div className="stitch-onboarding-cert-list-head">
          <h4>{hasPendingTargets ? "자동 등록 대상 고객" : "연결 상태"}</h4>
          <span>{hasPendingTargets ? `${props.pendingTargets.length}건` : "정리 완료"}</span>
        </div>

        {hasPendingTargets ? (
          <div className="stitch-onboarding-cert-list">
            {props.pendingTargets.map((target) => (
              <article key={target.id} className="stitch-onboarding-cert-item">
                <div className="stitch-onboarding-cert-item-copy">
                  <strong>{target.customerName}</strong>
                  <p>
                    {target.corpName} · {formatBusinessNumber(target.businessNumber)}
                  </p>
                </div>
                <div className="stitch-onboarding-cert-item-meta">
                  <span className="chip chip-warn">전자세금용 미등록</span>
                  <span>만료일 {props.formatCertificateExpireDate(target.popbillCertExpireDate)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="stitch-onboarding-cert-empty">
            엑셀 고객 등록 단계에서 넘어온 전자세금용 인증서 연결 대상이 없습니다. 이제 첫 동기화 / 첫 발행 확인 단계로
            넘어가면 됩니다.
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
