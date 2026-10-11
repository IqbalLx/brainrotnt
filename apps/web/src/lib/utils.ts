import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system's type styles (index.css) are font sizes, not colours. Without telling
// tailwind-merge, "text-label text-ink" would drop text-label as a conflicting colour.
export const TYPE_STYLES = ["display-lg", "display-sm", "heading-lg", "heading-sm", "body", "body-sm", "caption", "label", "code", "code-lg"];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: TYPE_STYLES }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
