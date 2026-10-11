import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:text-ink-faint",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand hover:brightness-110 disabled:bg-surface-high",
        outline: "border border-border text-ink-muted hover:bg-surface-high hover:text-ink",
        ghost: "text-ink-muted hover:bg-surface-high hover:text-ink",
        flagged: "border border-blocked text-blocked disabled:text-blocked",
        danger: "border border-danger bg-danger/10 text-danger hover:bg-danger/20",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
