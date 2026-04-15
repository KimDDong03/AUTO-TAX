import type { ComponentProps } from "react";
import { CertificatesTab } from "./CertificatesTab";

export type CertificatesScreenProps = ComponentProps<typeof CertificatesTab>;

export function CertificatesScreen(props: CertificatesScreenProps) {
  return (
    <div className="certificates-screen">
      <CertificatesTab {...props} />
    </div>
  );
}
