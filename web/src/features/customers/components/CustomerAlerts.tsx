import React from "react";
import { SectionMessage } from "../../../components/ui";
import type { Customer } from "../../../types";

type CustomerAlertsProps = {
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  formatCertificateExpireDate: (value: string | null) => string;
};

export function CustomerAlerts(props: CustomerAlertsProps) {
  if (props.expiredCertCustomers.length === 0 && props.expiringSoonCustomers.length === 0) {
    return null;
  }

  return (
    <div className="feature-customers-alert-stack">
      {props.expiredCertCustomers.length > 0 ? (
        <SectionMessage tone="danger" badgeLabel="만료" title={`인증서 만료 고객 ${props.expiredCertCustomers.length}건`} iconName="danger">
          {props.expiredCertCustomers.map((customer) => customer.customerName).join(", ")}
        </SectionMessage>
      ) : null}
      {props.expiringSoonCustomers.length > 0 ? (
        <SectionMessage
          tone="warning"
          badgeLabel="주의"
          title={`인증서 만료 예정 30일 이내 ${props.expiringSoonCustomers.length}건`}
          iconName="cert"
        >
          {props.expiringSoonCustomers
            .map((customer) => `${customer.customerName}(${props.formatCertificateExpireDate(customer.popbillCertExpireDate)})`)
            .join(", ")}
        </SectionMessage>
      ) : null}
    </div>
  );
}
