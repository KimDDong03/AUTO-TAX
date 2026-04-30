import { useMemo } from "react";
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

  return (
    <div className="certificates-screen">
      <CertificatesTab model={model} />
    </div>
  );
}
