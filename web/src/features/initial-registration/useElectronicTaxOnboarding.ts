import { useCallback } from "react";
import type { Customer, CustomerCertificate } from "../../types";
import {
  deriveCustomerCertificateKind,
  findRenewalCertificatesByIdentity,
  isCustomerCertificateExpired
} from "../renewal/customerRenewalCertificateUtils";
import type { RenewalAgentCertificate } from "../renewal/useRenewalAssistantState";
import type { CustomerOnboardingWorkbookInput } from "./customer-onboarding-workbook";

type UseElectronicTaxOnboardingArgs = {
  loadAvailableCertificates: () => Promise<RenewalAgentCertificate[]>;
};

export function useElectronicTaxOnboarding({ loadAvailableCertificates }: UseElectronicTaxOnboardingArgs) {
  const resolveSingleElectronicTaxCertificate = useCallback(
    async (
      customer: Customer,
      onboardingCertificateRow: CustomerOnboardingWorkbookInput["certificates"][number] | null,
      linkedCertificate: CustomerCertificate | null
    ) => {
      const certificateLabel =
        onboardingCertificateRow?.certificateName.trim() ||
        linkedCertificate?.certificateName.trim() ||
        customer.corpName.trim() ||
        customer.customerName.trim();
      const availableCertificates = (await loadAvailableCertificates()).filter(
        (certificate) => deriveCustomerCertificateKind(certificate) === "electronic_tax"
      );
      const activeCertificates = availableCertificates.filter(
        (certificate) => !isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
      );
      const targetIdentity = {
        certificateIndex: onboardingCertificateRow?.certificateIndex ?? null,
        certificateCn: certificateLabel || null,
        serial: onboardingCertificateRow?.serial || linkedCertificate?.serial || null,
        userDN: onboardingCertificateRow?.userDN || linkedCertificate?.userDN || null
      };
      const matches = findRenewalCertificatesByIdentity(activeCertificates, targetIdentity);

      if (matches.length === 0) {
        const expiredMatches = findRenewalCertificatesByIdentity(availableCertificates, targetIdentity).filter(
          (certificate) => isCustomerCertificateExpired(certificate.todate || certificate.detailValidateTo || null)
        );
        if (expiredMatches.length > 0) {
          throw new Error(
            `${customer.customerName} 고객의 전자세금용 공동인증서가 만료되어 자동 등록에서 제외했습니다. 갱신한 인증서를 다시 불러와 주세요.`
          );
        }
        throw new Error(`${customer.customerName} 고객의 전자세금용 공동인증서를 이 PC에서 다시 찾지 못했습니다.`);
      }
      if (matches.length > 1) {
        throw new Error(
          `${customer.customerName} 고객과 일치하는 전자세금용 공동인증서를 ${matches.length}건 발견해 자동 등록을 중단했습니다. 같은 CN 인증서가 여러 개이면 인증서 목록에서 확인 후 수동으로 등록하세요.`
        );
      }

      return matches[0] ?? null;
    },
    [loadAvailableCertificates]
  );

  return {
    resolveSingleElectronicTaxCertificate
  };
}
