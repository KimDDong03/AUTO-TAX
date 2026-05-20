import * as React from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { StatusBadge, type ConsoleStatus, type ConsoleTone } from "./status";

export function TaskProgressStrip({
  title,
  description,
  value,
  current,
  total,
  status,
  tone = "info",
  meta,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  value: number;
  current?: number;
  total?: number;
  status?: ConsoleStatus;
  tone?: ConsoleTone;
  meta?: Array<{ label: React.ReactNode; value: React.ReactNode }>;
}) {
  const boundedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      data-slot="task-progress-strip"
      role="status"
      aria-live="polite"
      className={cn("rounded-md border border-slate-200 bg-white p-3 shadow-none", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block text-sm font-semibold leading-snug text-slate-950">{title}</strong>
          {description ? <p className="mt-1 text-xs font-medium leading-normal text-slate-500">{description}</p> : null}
        </div>
        {status ? <StatusBadge status={status} tone={tone} /> : current !== undefined && total !== undefined ? (
          <span className="text-xs font-semibold text-slate-500">
            {current}/{total}건
          </span>
        ) : null}
      </div>
      <Progress value={boundedValue} className="mt-3 h-1.5 rounded-sm bg-slate-100" />
      {meta && meta.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
          {meta.map((item) => (
            <span key={String(item.label)}>
              {item.label} {item.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
