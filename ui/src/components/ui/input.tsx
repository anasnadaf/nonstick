import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Ruled-paper field: a single baseline rather than a box.
        "h-9 w-full min-w-0 rounded-none border-0 border-b border-input bg-transparent px-0 py-1 text-sm transition-colors outline-none selection:bg-copper selection:text-paper file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-ink-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:border-copper focus-visible:outline-none",
        "aria-invalid:border-vermilion",
        className
      )}
      {...props}
    />
  )
}

export { Input }
