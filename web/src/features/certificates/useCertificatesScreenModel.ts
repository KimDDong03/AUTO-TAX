import { useMemo } from "react";
import type { Customer, CustomerCertificate, CustomerCertificateKind, RenewalBridgePreflightProbe } from "../../types";
import type { RenewalAgentCertificate, RenewalJob } from "../renewal/useRenewalAssistantState";
import {
  deriveCustomerCertificateKind,
  findCandidateCustomersForCertificate,
  findLocalCertificateForStoredCustomerCertificate,
  findStoredCustomerCertificateForLocalCertificate,
  formatCustomerRenewalStatus,
  getLatestRenewalPreflightProbeForCertificate
} from "../renewal/customerRenewalCertificateUtils";

export type CustomerCertificateCandidateView = {
  key: string;
  certificateIndex: string;
  certificateCn: string;
  certificateKind: CustomerCertificateKind;
  certificateUsage: string;
  issuerName: string;
  certificateExpireDate: string | null;
  linkedCertificateId: number | null;
  linkedCustomerId: number | null;
  linkedCustomerLabel: string | null;
  linkSource: CustomerCertificate["linkSource"] | null;
  suggestedCustomerId: number | null;
  suggestedCustomerLabel: string | null;
  suggestionCount: number;
  statusText: string;
  statusTone: "success" | "warn" | "danger" | "default";
  paymentAmount: string | null;
  canOpenPayment: boolean;
};

export type CertificatesScreenMetrics = {
  loadedCertificateCount: number;
  unlinkedCount: number;
  paymentReadyCount: number;
  actionNeededCount: number;
};

export type UseCertificatesScreenModelArgs = {
  customers: Customer[];
  customerCertificates: CustomerCertificate[];
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantJobs: RenewalJob[];
  customerRenewalAssistantAllCertificates: RenewalAgentCertificate[];
};

export function useCertificatesScreenModel({
  customers,
  customerCertificates,
  customerRenewalAssistantOnline,
  customerRenewalAssistantJobs,
  customerRenewalAssistantAllCertificates
}: UseCertificatesScreenModelArgs) {
  const certificateItems = useMemo<CustomerCertificateCandidateView[]>(
    () =>
      [
        ...customerCertificates.map((storedCertificate) => {
          const linkedCustomer = customers.find((customer) => customer.id === storedCertificate.customerId) ?? null;
          const localCertificate = findLocalCertificateForStoredCustomerCertificate(
            storedCertificate,
            customerRenewalAssistantAllCertificates
          );
          const preflightProbe = localCertificate
            ? getLatestRenewalPreflightProbeForCertificate(localCertificate, customerRenewalAssistantJobs, null)
            : null;
          const status = localCertificate
            ? formatCustomerRenewalStatus(preflightProbe)
            : {
                statusText: customerRenewalAssistantOnline ? "연결됨 · 로컬 인증서 읽기 전" : "연결됨",
                statusTone: "default" as const,
                paymentAmount: null,
                canOpenPayment: false
              };

          return {
            key: `stored:${storedCertificate.id}`,
            certificateIndex: localCertificate ? String(localCertificate.index) : `stored:${storedCertificate.id}`,
            certificateCn:
              storedCertificate.certificateName || linkedCustomer?.customerName || `연결된 인증서 #${storedCertificate.id}`,
            certificateKind: storedCertificate.certificateKind,
            certificateUsage: storedCertificate.certificateUsageName,
            issuerName: storedCertificate.issuerName,
            certificateExpireDate: storedCertificate.expireDate,
            linkedCertificateId: storedCertificate.id,
            linkedCustomerId: linkedCustomer?.id ?? null,
            linkedCustomerLabel: linkedCustomer ? `${linkedCustomer.customerName} · ${linkedCustomer.corpName}` : null,
            linkSource: storedCertificate.linkSource,
            suggestedCustomerId: null,
            suggestedCustomerLabel: null,
            suggestionCount: 0,
            statusText: status.statusText,
            statusTone: status.statusTone,
            paymentAmount: status.paymentAmount,
            canOpenPayment: status.canOpenPayment
          } satisfies CustomerCertificateCandidateView;
        }),
        ...customerRenewalAssistantAllCertificates
          .filter((certificate) => !findStoredCustomerCertificateForLocalCertificate(certificate, customerCertificates))
          .map((certificate) => {
            const candidateCustomers = findCandidateCustomersForCertificate(certificate, customers);
            const suggestedCustomer = candidateCustomers.length === 1 ? candidateCustomers[0] ?? null : null;
            const preflightProbe = getLatestRenewalPreflightProbeForCertificate(
              certificate,
              customerRenewalAssistantJobs,
              null
            );
            const status = formatCustomerRenewalStatus(preflightProbe);

            return {
              key: `local:${certificate.index}`,
              certificateIndex: String(certificate.index),
              certificateCn: certificate.cn || `인증서 #${certificate.index}`,
              certificateKind: deriveCustomerCertificateKind(certificate),
              certificateUsage: certificate.usageToName,
              issuerName: certificate.issuerToName,
              certificateExpireDate: certificate.todate ?? certificate.detailValidateTo ?? null,
              linkedCertificateId: null,
              linkedCustomerId: null,
              linkedCustomerLabel: null,
              linkSource: null,
              suggestedCustomerId: suggestedCustomer?.id ?? null,
              suggestedCustomerLabel: suggestedCustomer
                ? `${suggestedCustomer.customerName} · ${suggestedCustomer.corpName}`
                : null,
              suggestionCount: candidateCustomers.length,
              statusText: status.statusText,
              statusTone: status.statusTone,
              paymentAmount: status.paymentAmount,
              canOpenPayment: status.canOpenPayment
            } satisfies CustomerCertificateCandidateView;
          })
      ].sort((left, right) => {
        const kindOrder = (kind: CustomerCertificateKind) => {
          if (kind === "electronic_tax") return 0;
          if (kind === "general_personal") return 1;
          if (kind === "general_business") return 2;
          return 3;
        };
        const linkPriority = Number(Boolean(right.linkedCustomerId)) - Number(Boolean(left.linkedCustomerId));
        if (linkPriority !== 0) {
          return linkPriority;
        }
        const kindPriority = kindOrder(left.certificateKind) - kindOrder(right.certificateKind);
        if (kindPriority !== 0) {
          return kindPriority;
        }
        const leftTime = left.certificateExpireDate ? new Date(left.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.certificateExpireDate ? new Date(right.certificateExpireDate).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.certificateCn.localeCompare(right.certificateCn, "ko");
      }),
    [
      customerCertificates,
      customerRenewalAssistantAllCertificates,
      customerRenewalAssistantJobs,
      customerRenewalAssistantOnline,
      customers
    ]
  );

  const metrics = useMemo<CertificatesScreenMetrics>(
    () => ({
      loadedCertificateCount: customerRenewalAssistantAllCertificates.length,
      unlinkedCount: certificateItems.filter((item) => item.linkedCustomerId === null).length,
      paymentReadyCount: certificateItems.filter((item) => item.canOpenPayment).length,
      actionNeededCount: certificateItems.filter((item) => item.statusTone === "warn" || item.statusTone === "danger").length
    }),
    [certificateItems, customerRenewalAssistantAllCertificates.length]
  );

  return {
    certificateItems,
    metrics
  };
}
