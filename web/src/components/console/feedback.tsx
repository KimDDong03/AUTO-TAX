import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { ConsoleTone } from "./status";

const NOTICE_ICON_BY_TONE: Record<ConsoleTone, LucideIcon> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  muted: CircleHelp
};

export function InlineNotice({
  title,
  children,
  actions,
  tone = "info",
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Alert>, "title"> & {
  title?: React.ReactNode;
  tone?: ConsoleTone;
  icon?: LucideIcon | false;
  actions?: React.ReactNode;
}) {
  const IconComponent = icon === false ? null : icon ?? NOTICE_ICON_BY_TONE[tone];

  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      className={cn(
        "section-message grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border px-3 py-2 shadow-none",
        tone === "info" && "border-blue-100 bg-blue-50/60 text-blue-950",
        tone === "success" && "border-green-100 bg-green-50/60 text-green-950",
        tone === "warning" && "border-amber-100 bg-amber-50/60 text-amber-950",
        tone === "danger" && "border-red-100 bg-red-50/60 text-red-950",
        tone === "muted" && "border-slate-200 bg-slate-50 text-slate-700",
        className
      )}
      {...props}
    >
      {IconComponent ? <IconComponent className="mt-0.5 size-4" aria-hidden="true" /> : null}
      <div className="section-message-copy min-w-0">
        {title ? <AlertTitle className="col-auto min-h-0 text-xs font-semibold leading-normal">{title}</AlertTitle> : null}
        <AlertDescription className="col-auto text-xs font-medium leading-normal text-current/80">
          {children}
        </AlertDescription>
      </div>
      {actions ? <div className="section-message-actions flex items-center gap-2">{actions}</div> : null}
    </Alert>
  );
}

export function EmptyState({
  title,
  body,
  actions,
  tone = "default",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "title"> & {
  title: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: ConsoleTone;
}) {
  return (
    <Card
      data-slot="empty-state"
      className={cn(
        "empty-state gap-2 rounded-md border border-dashed border-slate-300 bg-white p-4 text-center shadow-none",
        tone === "success" && "border-green-200 bg-green-50/40",
        tone === "warning" && "border-amber-200 bg-amber-50/40",
        tone === "danger" && "border-red-200 bg-red-50/40",
        `empty-state-${tone === "warning" ? "warn" : tone}`,
        className
      )}
      {...props}
    >
      <strong className="text-sm font-semibold text-slate-900">{title}</strong>
      {body ? <p className="m-0 text-xs font-medium leading-normal text-slate-500">{body}</p> : null}
      {actions ? <div className="empty-state-actions mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </Card>
  );
}
