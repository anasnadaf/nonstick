import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Badges read as printed marginalia: squared, mono, tracked out, tabular.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[1px] border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.12em] uppercase whitespace-nowrap tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper [&>svg]:pointer-events-none [&>svg]:size-2.5",
  {
    variants: {
      variant: {
        default: "border-rule-strong bg-transparent text-ink-muted",
        copper: "border-copper/40 bg-copper-wash text-copper-deep",
        secondary: "border-transparent bg-secondary text-ink-muted",
        destructive:
          "border-vermilion/40 bg-vermilion/10 text-vermilion [a&]:hover:bg-vermilion/15",
        success: "border-verdigris/40 bg-verdigris/10 text-verdigris",
        outline: "border-rule text-foreground [a&]:hover:border-copper",
        ghost: "border-transparent text-ink-faint",
        link: "border-transparent text-copper-deep underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
