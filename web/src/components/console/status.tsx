import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDot, CircleX, Clock3 } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ConsoleTone = "default" | "info" | "success" | "warning" | "danger" | "muted";
export type ConsoleStatus = "complete" | "current" | "pending" | "needsAttention" | "failed";

const STATUS_META: Record<ConsoleStatus, { label: string; tone: ConsoleTone; icon: LucideIcon }> = {
  complete: { label: "완료", tone: "success", icon: CheckCircle2 },
  current: { label: "지금", tone: "info", icon: CircleDot },
  pending: { label: "대기", tone: "muted", icon: Clock3 },
  needsAttention: { label: "확인 필요", tone: "warning", icon: AlertTriangle },
  failed: { label: "실패", tone: "danger", icon: CircleX }
};

const BADGE_VARIANT_BY_TONE: Record<ConsoleTone, React.ComponentProps<typeof Badge>["variant"]> = {
  default: "outline",
  info: "default",
  success: "secondary",
  warning: "outline",
  danger: "destructive",
  muted: "outline"
};

export function getConsoleStatusLabel(status: ConsoleStatus) {
  return STATUS_META[status].label;
}

export function getConsoleStatusTone(status: ConsoleStatus) {
  return STATUS_META[status].tone;
}

export function StatusBadge({
  children,
  status,
  tone,
  icon,
  className,
  size = "sm",
  ...props
}: React.ComponentProps<typeof Badge> & {
  status?: ConsoleStatus;
  tone?: ConsoleTone;
  icon?: LucideIcon | false;
  size?: "xs" | "sm";
}) {
  const resolvedTone = tone ?? (status ? STATUS_META[status].tone : "default");
  const IconComponent = icon === false ? null : icon ?? (status ? STATUS_META[status].icon : null);

  return (
    <Badge
      variant={BADGE_VARIANT_BY_TONE[resolvedTone]}
      className={cn(
        "status-badge gap-1 rounded-full border py-0 font-semibold",
        size === "xs" && "px-1.5 text-[10px] leading-[18px]",
        size === "sm" && "px-2 text-[11px] leading-5",
        resolvedTone === "default" && "border-slate-200 bg-white text-slate-600",
        resolvedTone === "info" && "border-blue-200 bg-blue-50 text-blue-700",
        resolvedTone === "success" && "border-green-200 bg-green-50 text-green-700",
        resolvedTone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        resolvedTone === "danger" && "border-red-200 bg-red-50 text-red-700",
        resolvedTone === "muted" && "border-slate-200 bg-slate-50 text-slate-500",
        `status-badge-${resolvedTone === "warning" ? "warn" : resolvedTone}`,
        className
      )}
      {...props}
    >
      {IconComponent ? <IconComponent className="size-3" aria-hidden="true" /> : null}
      {children ?? (status ? STATUS_META[status].label : null)}
    </Badge>
  );
}

export function FilterChip({
  active,
  count,
  children,
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  count?: React.ReactNode;
  variant?: "default" | "pill";
}) {
  const isPill = variant === "pill";

  return (
    <button
      data-slot="filter-chip"
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-none transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
        isPill && "h-[34px] rounded-full px-3 font-bold",
        active && "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
        isPill &&
          active &&
          "!border-slate-900 !bg-slate-900 !text-white hover:!border-slate-900 hover:!bg-slate-900 hover:!text-white",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined ? <span className="text-[11px] text-current opacity-75">{count}</span> : null}
    </button>
  );
}
