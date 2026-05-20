import * as React from "react";

import { cn } from "@/lib/utils";

import { EmptyState } from "./feedback";
import type { ConsoleTone } from "./status";

export function TableToolbar({
  title,
  description,
  actions,
  unstyled = false,
  density = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  unstyled?: boolean;
  density?: "default" | "compact";
}) {
  if (unstyled) {
    return (
      <div data-slot="table-toolbar" className={className} {...props}>
        {children}
        {actions}
      </div>
    );
  }

  return (
    <div
      data-slot="table-toolbar"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-slate-200",
        density === "default" && "px-3 py-2",
        density === "compact" && "min-h-[52px] px-3 py-2",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        {title ? <strong className="block text-sm font-semibold leading-snug text-slate-950">{title}</strong> : null}
        {description ? <p className="m-0 mt-1 text-xs font-medium leading-normal text-slate-500">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

export function TableEmptyState({
  colSpan,
  title,
  body,
  actions,
  tone,
  rowClassName,
  className,
}: {
  colSpan: number;
  title: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: ConsoleTone;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <tr className={rowClassName}>
      <td colSpan={colSpan} className="p-3">
        <EmptyState title={title} body={body} actions={actions} tone={tone} className={className} />
      </td>
    </tr>
  );
}
