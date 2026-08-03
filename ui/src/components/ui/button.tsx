import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] text-[13px] font-medium tracking-[0.005em] whitespace-nowrap transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Ink fill that oxidises to copper on hover — the house move.
        default:
          "bg-primary text-primary-foreground hover:bg-copper hover:text-paper",
        copper: "bg-copper text-paper hover:bg-copper-deep",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline:
          "border border-rule-strong bg-transparent text-foreground hover:border-copper hover:text-copper-deep",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-copper-wash hover:text-copper-deep",
        ghost: "text-ink-muted hover:bg-copper-wash hover:text-copper-deep",
        link: "text-copper-deep underline decoration-rule-strong underline-offset-4 hover:decoration-copper",
      },
      size: {
        default: "h-9 px-5 py-2 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 px-7 text-sm has-[>svg]:px-5",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
