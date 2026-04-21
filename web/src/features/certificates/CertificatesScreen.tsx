import { useMemo } from "react";
import { Icon } from "../../components/ui";
import { CertificatesTab, type CertificatesTabModel } from "./CertificatesTab";
import { useCertificatesScreenModel } from "./useCertificatesScreenModel";
import type { Customer } from "../../types";

type CertificatesScreenProps = {
  customers: Customer[];
  busyKey: string | null;
  canUseCustomerRenewalAssistant: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalAssistantUpgradeState: "unknown" | "up-to-date" | "upgrade-available" | "upgrade-required";
  customerRenewalAssistantUpgradeMessage: string | null;
  customerRenewalAssistantLatestVersion: string | null;
  customerRenewalAssistantMinSupportedVersion: string | null;
  renewalHelperDownloadUrl: string;
  customerRenewalLoadedCertificateCount: number;
  userLabel: string;
  workspaceLabel: string;
  popbillModeLabel: string;
  certificatesModel: ReturnType<typeof useCertificatesScreenModel>;
  onLinkCustomerCertificate: (certificateIndex: string, customerId: number) => Promise<void>;
  onUnlinkCustomerCertificate: (certificateId: number) => Promise<void>;
  onPrepareCustomerCertificateRenewal: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  onOpenCustomerCertificatePayment: (certificateIndex: string, options?: { showAlert?: boolean }) => Promise<void>;
  runRefreshCustomerRenewalAssistant: () => Promise<void>;
  runLoadCustomerRenewalCertificates: () => Promise<void>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
};

function getCertificatesHeaderChipClassName(tone: "default" | "warn" | "success") {
  if (tone === "warn") return "home-header-chip tone-warn";
  if (tone === "success") return "home-header-chip tone-success";
  return "home-header-chip";
}

export function CertificatesScreen(props: CertificatesScreenProps) {
  const model = useMemo<CertificatesTabModel>(
    () => ({
      customers: props.customers,
      busyKey: props.busyKey,
      canUseCustomerRenewalAssistant: props.canUseCustomerRenewalAssistant,
      customerRenewalAssistantOnline: props.customerRenewalAssistantOnline,
      customerRenewalAssistantHelperVersion: props.customerRenewalAssistantHelperVersion,
      customerRenewalAssistantHelperMessage: props.customerRenewalAssistantHelperMessage,
      customerRenewalAssistantUpgradeState: props.customerRenewalAssistantUpgradeState,
      customerRenewalAssistantUpgradeMessage: props.customerRenewalAssistantUpgradeMessage,
      customerRenewalAssistantLatestVersion: props.customerRenewalAssistantLatestVersion,
      customerRenewalAssistantMinSupportedVersion: props.customerRenewalAssistantMinSupportedVersion,
      renewalHelperDownloadUrl: props.renewalHelperDownloadUrl,
      customerRenewalLoadedCertificateCount: props.customerRenewalLoadedCertificateCount,
      certificateItems: props.certificatesModel.certificateItems,
      runRefreshCustomerRenewalAssistant: props.runRefreshCustomerRenewalAssistant,
      runLoadCustomerRenewalCertificates: props.runLoadCustomerRenewalCertificates,
      onLinkCustomerCertificate: props.onLinkCustomerCertificate,
      onUnlinkCustomerCertificate: props.onUnlinkCustomerCertificate,
      onPrepareCustomerCertificateRenewal: props.onPrepareCustomerCertificateRenewal,
      onOpenCustomerCertificatePayment: props.onOpenCustomerCertificatePayment,
      runAction: props.runAction,
      formatCertificateExpireDate: props.formatCertificateExpireDate
    }),
    [props]
  );
  const metrics = props.certificatesModel.metrics;
  const helperHeaderTone =
    props.customerRenewalAssistantUpgradeState === "upgrade-required" ||
    props.customerRenewalAssistantUpgradeState === "upgrade-available"
      ? "warn"
      : props.customerRenewalAssistantOnline
        ? "success"
        : "default";
  const helperHeaderLabel =
    props.customerRenewalAssistantUpgradeState === "upgrade-required"
      ? "헬퍼 재설치 필요"
      : props.customerRenewalAssistantUpgradeState === "upgrade-available"
        ? "헬퍼 업데이트 필요"
        : props.customerRenewalAssistantOnline
          ? "헬퍼 연결됨"
          : "헬퍼 실행 필요";

  return (
    <div className="certificates-screen">
      <header className="home-page-header certificates-page-header">
        <div className="home-page-header-copy">
          <h2>인증서 관리</h2>
          <div className="home-page-header-chips">
            <span className="home-header-chip home-header-chip-user">{props.workspaceLabel}</span>
            <span className={getCertificatesHeaderChipClassName(helperHeaderTone)}>{helperHeaderLabel}</span>
            <span className="home-header-chip">로컬 읽음 {metrics.loadedCertificateCount}건</span>
            <span className={getCertificatesHeaderChipClassName(metrics.actionNeededCount > 0 ? "warn" : "default")}>
              조치 필요 {metrics.actionNeededCount}건
            </span>
            <span className="home-header-chip">미연결 {metrics.unlinkedCount}건</span>
            <span className={getCertificatesHeaderChipClassName(metrics.paymentReadyCount > 0 ? "success" : "default")}>
              결제 가능 {metrics.paymentReadyCount}건
            </span>
          </div>
        </div>
        <div className="home-page-header-account">
          <div className="home-page-header-account-copy">
            <strong>{props.userLabel}</strong>
            <span>
              {props.workspaceLabel} · {props.popbillModeLabel}
            </span>
          </div>
          <span className="home-page-header-account-avatar" aria-hidden="true">
            <Icon name="user" className="home-page-header-account-avatar-icon" />
          </span>
        </div>
      </header>
      <CertificatesTab model={model} />
    </div>
  );
}
