import * as React from "react";

import { cn } from "@/lib/utils";

export function InfoSection({
  title,
  children,
  className,
  listClassName,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  listClassName?: string;
}) {
  return (
    <section data-slot="info-section" className={cn("info-section", className)} aria-label={`${title} 정보`} {...props}>
      <h3>{title}</h3>
      <dl className={cn("info-section-list", listClassName)}>{children}</dl>
    </section>
  );
}

export function InfoRow({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode;
}) {
  return (
    <div data-slot="info-row" className={cn("info-row", className)} {...props}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
