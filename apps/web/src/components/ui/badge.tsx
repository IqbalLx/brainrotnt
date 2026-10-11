import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status and tag pills: monospace caps on a tinted fill, so they read as markers, not buttons.
const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label uppercase", {
  variants: {
    variant: {
      brand: "border-brand/40 bg-brand/15 text-brand-ink",
      info: "border-info/40 bg-info/10 text-info",
      muted: "border-border bg-surface-sunken text-ink-muted",
      ink: "border-border bg-surface-high text-ink",
      success: "border-success/40 bg-success/10 text-success",
      blocked: "border-blocked/40 bg-blocked/10 text-blocked",
      danger: "border-danger/40 bg-danger/10 text-danger",
    },
  },
  defaultVariants: { variant: "muted" },
});

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
