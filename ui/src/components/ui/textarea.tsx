import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Multi-line stays a boxed well so the writing area reads as a field.
        "flex field-sizing-content min-h-16 w-full rounded-[2px] border border-rule bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-ink-faint focus-visible:border-copper focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-vermilion",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
