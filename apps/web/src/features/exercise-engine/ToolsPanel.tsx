import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

// The tools beside a problem, one tab at a time. Panels stay mounted while hidden so the calculator
// keeps its expression when you look at a hint. Alt+1, Alt+2... switch tabs.
export function ToolsPanel({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && tabs[index]) {
        event.preventDefault();
        setActive(tabs[index].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs]);

  if (tabs.length === 0) return null;
  return (
    <section aria-label="Tools" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Tools" className="flex gap-1">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`${base}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={current === tab.id}
              aria-controls={`${base}-${tab.id}`}
              title={`Alt+${index + 1}`}
              onClick={() => setActive(tab.id)}
              className={cn(
                "-mb-px border-b-2 px-2 pb-2 pt-1 text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring",
                current === tab.id ? "border-info text-info" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="hidden pb-2 text-label text-ink-faint sm:inline">{tabs.map((_, i) => `Alt+${i + 1}`).join(" / ")}</span>
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`${base}-${tab.id}`} role="tabpanel" aria-labelledby={`${base}-${tab.id}-tab`} hidden={current !== tab.id}>
          {tab.content}
        </div>
      ))}
    </section>
  );
}
