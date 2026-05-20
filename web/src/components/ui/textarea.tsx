import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 shadow-none transition-[color,box-shadow,border-color] outline-none placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-[3px] focus-visible:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
