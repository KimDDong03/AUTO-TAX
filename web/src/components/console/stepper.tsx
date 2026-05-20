import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StatusBadge, type ConsoleStatus } from "./status";

export type TaskStepItem = {
  id: string;
  order: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  status: ConsoleStatus;
  disabled?: boolean;
};

export function TaskStepper({
  steps,
  activeId,
  onSelect,
  label,
  variant = "list",
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"ol">, "onSelect"> & {
  steps: TaskStepItem[];
  activeId?: string;
  onSelect?: (step: TaskStepItem) => void;
  label?: string;
  variant?: "list" | "pills";
}) {
  return (
    <ol
      data-slot="task-stepper"
      data-variant={variant}
      className={cn(variant === "pills" ? "m-0 flex list-none flex-wrap gap-2 p-0" : "m-0 grid list-none gap-2 p-0", className)}
      style={variant === "pills" ? { display: "flex", flexWrap: "wrap", ...style } : style}
      aria-label={label}
      {...props}
    >
      {steps.map((step) => {
        const active = step.id === activeId;
        const clickable = Boolean(onSelect) && !step.disabled;

        if (variant === "pills") {
          const pillClassName = cn(
            "inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-none",
            active && "border-blue-200 bg-blue-50 text-blue-700",
            step.status === "complete" && "border-green-200 bg-green-50 text-green-700",
            step.status === "needsAttention" && "border-amber-200 bg-amber-50 text-amber-700",
            step.status === "failed" && "border-red-200 bg-red-50 text-red-700"
          );

          return (
            <li key={step.id}>
              {clickable ? (
                <button type="button" className={pillClassName} onClick={() => onSelect?.(step)}>
                  <span>{step.order}</span>
                  <span>{step.title}</span>
                </button>
              ) : (
                <span className={pillClassName}>
                  <span>{step.order}</span>
                  <span>{step.title}</span>
                </span>
              )}
            </li>
          );
        }

        return (
          <li key={step.id}>
            <Button
              type="button"
              variant={active ? "secondary" : "ghost"}
              disabled={!clickable}
              className={cn(
                "h-auto w-full justify-start rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-slate-700 hover:bg-slate-50",
                active && "border-blue-200 bg-blue-50 text-slate-950",
                step.status === "complete" && "border-green-200 bg-green-50/50",
                !clickable && "pointer-events-auto opacity-100"
              )}
              onClick={clickable ? () => onSelect?.(step) : undefined}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-semibold">
                {step.order}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-xs font-semibold">{step.title}</span>
                {step.description ? <span className="truncate text-xs font-medium text-slate-500">{step.description}</span> : null}
              </span>
              <StatusBadge status={step.status} icon={false} />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
