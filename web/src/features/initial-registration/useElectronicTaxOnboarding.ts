import { useCallback } from "react";
import type { Customer, CustomerCertificate } from "../../types";
import {
  deriveCustomerCertificateKind,
  findRenewalCertificatesByIdentity
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
      const matches = findRenewalCertificatesByIdentity(availableCertificates, {
        certificateIndex: onboardingCertificateRow?.certificateIndex ?? null,
        certificateCn: certificateLabel || null,
        serial: onboardingCertificateRow?.serial || linkedCertificate?.serial || null,
        userDN: onboardingCertificateRow?.userDN || linkedCertificate?.userDN || null
      });

      if (matches.length === 0) {
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
