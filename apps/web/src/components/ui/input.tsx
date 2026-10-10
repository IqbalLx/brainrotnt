import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex w-full min-w-0 rounded-md border border-border bg-surface-sunken px-3 py-2 text-code text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-ink-faint",
        className,
      )}
      {...props}
    />
  );
}
