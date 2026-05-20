import { Eye, EyeOff, Search } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  hint,
  error,
  children,
  className,
  ...props
}: React.ComponentProps<"label"> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <label className={cn("grid gap-1 text-xs font-semibold text-slate-700", className)} {...props}>
      <span>{label}</span>
      {children}
      {hint ? <span className="field-hint text-xs font-medium text-slate-500">{hint}</span> : null}
      {error ? <span className="field-hint tone-danger text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

export function PasswordField({
  visible,
  onVisibleChange,
  buttonLabel,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  buttonLabel?: string;
}) {
  const IconComponent = visible ? EyeOff : Eye;

  return (
    <div className={cn("password-field relative mt-0", className)}>
      <Input type={visible ? "text" : "password"} className="pr-10" {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="password-toggle absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
        aria-label={buttonLabel ?? (visible ? "비밀번호 숨기기" : "비밀번호 보기")}
        onClick={() => onVisibleChange(!visible)}
      >
        <IconComponent className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SearchField({
  children,
  className,
  iconClassName,
  inputClassName,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<typeof Input>, "children"> & {
  children?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  variant?: "default" | "console";
}) {
  const isConsole = variant === "console";

  return (
    <div
      data-slot="search-field"
      className={cn(
        "relative",
        isConsole &&
          "!inline-flex !h-8 !min-h-8 !w-full !min-w-0 !items-center !justify-start !gap-2 !overflow-hidden !rounded-[4px] !border !border-transparent !bg-[#f0f1f4] !px-3 !shadow-none transition-colors hover:!border-slate-300 hover:!bg-white focus-within:!border-[#c8d2e4] focus-within:!bg-white focus-within:!shadow-none",
        className
      )}
    >
      <Search
        className={cn(
          "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400",
          isConsole && "!left-3 !size-4 !text-slate-500",
          iconClassName
        )}
        aria-hidden="true"
      />
      {children}
      <Input
        type="search"
        className={cn(
          "!border-0 !bg-transparent pl-8 !shadow-none focus:!shadow-none focus-visible:!border-transparent focus-visible:!shadow-none focus-visible:!ring-0",
          isConsole &&
            "!m-0 !box-border !h-[30px] !min-h-[30px] !w-full !flex-1 !px-0 !py-0 !pl-6 !text-xs !font-bold !leading-[30px] !text-slate-900 placeholder:!text-slate-400 focus:!outline-none focus-visible:!outline-none",
          inputClassName
        )}
        {...props}
      />
    </div>
  );
}
