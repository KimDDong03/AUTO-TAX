import { Slot } from "radix-ui";
import * as React from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WorkPanel({
  asChild,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Card> & {
  asChild?: boolean;
}) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="work-panel"
        className={cn("panel rounded-md border border-slate-200 bg-white shadow-none", className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <Card
      data-slot="work-panel"
      className={cn("panel gap-4 rounded-md border-slate-200 bg-white p-0 py-0 shadow-none", className)}
      {...props}
    >
      {children}
    </Card>
  );
}

export function WorkPanelHeader({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: React.ComponentProps<typeof CardHeader> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <CardHeader
      data-slot="work-panel-header"
      className={cn("panel-header grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-3", className)}
      {...props}
    >
      <div className="min-w-0">
        {title ? <h2 className="m-0 text-sm font-bold leading-snug text-slate-950">{title}</h2> : null}
        {description ? <p className="mt-1 text-xs font-medium leading-normal text-slate-500">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="panel-actions flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </CardHeader>
  );
}

export function WorkPanelBody({
  className,
  ...props
}: React.ComponentProps<typeof CardContent>) {
  return <CardContent data-slot="work-panel-body" className={cn("px-4 pb-4", className)} {...props} />;
}

export function MetricCard({
  label,
  value,
  description,
  tone = "default",
  icon,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  return (
    <div
      data-slot="metric-card"
      className={cn(
        "stat-card rounded-md border border-slate-200 bg-white p-3 shadow-none",
        tone === "success" && "border-green-200 bg-green-50/50",
        tone === "warning" && "border-amber-200 bg-amber-50/50",
        tone === "danger" && "border-red-200 bg-red-50/50",
        className
      )}
      {...props}
    >
      <div className="stat-card-head flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <strong className="mt-2 block text-lg font-bold leading-none text-slate-950">{value}</strong>
      {description ? <p className="mt-1 text-xs font-medium leading-normal text-slate-500">{description}</p> : null}
    </div>
  );
}

export function SummaryFilterCard({
  asChild,
  active,
  tone = "default",
  variant = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  active?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
  variant?: "default" | "pill";
}) {
  const Component = asChild ? Slot.Root : "button";
  const isPill = variant === "pill";

  return (
    <Component
      data-slot="summary-filter-card"
      type="button"
      aria-pressed={active}
      className={cn(
        "summary-filter-card",
        isPill &&
          "!inline-flex !h-[34px] !min-h-[34px] !w-auto !min-w-0 !flex-none !items-center !justify-center !gap-2 !whitespace-nowrap !rounded-full !border !border-slate-200 !bg-white !px-[13px] !py-0 !text-xs !font-bold !leading-none !text-slate-600 !shadow-none transition-colors [&>span]:inline-flex [&>span]:items-center [&>span]:text-xs [&>span]:font-bold [&>span]:leading-none [&_.summary-filter-card-count]:inline-flex [&_.summary-filter-card-count]:h-5 [&_.summary-filter-card-count]:min-w-[22px] [&_.summary-filter-card-count]:items-center [&_.summary-filter-card-count]:justify-center [&_.summary-filter-card-count]:rounded-full [&_.summary-filter-card-count]:bg-slate-100 [&_.summary-filter-card-count]:px-1.5 [&_.summary-filter-card-count]:text-slate-900 [&_.summary-filter-card-count_strong]:text-[11px] [&_.summary-filter-card-count_strong]:font-bold [&_.summary-filter-card-count_strong]:leading-none",
        isPill &&
          active &&
          "!border-slate-900 !bg-slate-900 !text-white [&_.summary-filter-card-count]:!bg-white/15 [&_.summary-filter-card-count]:!text-white",
        active && "is-active",
        tone === "success" && "tone-success",
        tone === "warning" && "tone-warn",
        tone === "danger" && "tone-danger",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
