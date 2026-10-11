import * as React from "react";
import { cn } from "@/lib/utils";

// Level 1 panel: surface fill, hairline border, no drop shadow.
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-5 rounded-lg border border-border bg-surface-raised p-6 text-ink", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-heading-sm", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-body-sm text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3", className)} {...props} />;
}

/** A small monospace caps heading above a section, as in "UNLOCKED SOLUTIONS". */
export function SectionLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-label uppercase text-ink-faint", className)} {...props} />;
}
