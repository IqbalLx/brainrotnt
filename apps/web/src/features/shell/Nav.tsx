import { cn } from "@/lib/utils";
import { hrefFor, type Route } from "./useRoute";

const LINKS: { label: string; route: Route }[] = [
  { label: "Exercise", route: { page: "exercise" } },
  { label: "Review", route: { page: "review", sessionId: null } },
];

export function Nav({ current }: { current: Route["page"] }) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      {LINKS.map(({ label, route }) => (
        <a
          key={label}
          href={hrefFor(route)}
          aria-current={current === route.page ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-body-sm transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring",
            current === route.page ? "bg-surface-high text-ink" : "text-ink-muted hover:bg-surface-raised hover:text-ink",
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
