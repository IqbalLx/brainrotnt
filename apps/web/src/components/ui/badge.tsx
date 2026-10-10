import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-2 rounded-full px-3 py-1 text-label uppercase", {
  variants: {
    variant: {
      brand: "bg-brand text-on-brand",
      muted: "bg-surface-sunken text-ink-muted",
      ink: "bg-surface-sunken text-ink",
      success: "bg-success text-on-success",
      blocked: "bg-blocked text-on-blocked",
      danger: "bg-danger text-on-danger",
    },
  },
  defaultVariants: { variant: "muted" },
});

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
