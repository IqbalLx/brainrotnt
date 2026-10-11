import { lazy, Suspense, useState } from "react";
import { Lock } from "lucide-react";

// The Markdown and KaTeX renderer is only fetched when an explanation is first opened.
const Markdown = lazy(() => import("./Markdown"));

export function Explanation({ source, locked }: { source: string | null; locked: boolean }) {
  const [open, setOpen] = useState(false);

  if (locked) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-ink-faint">
        <Lock className="size-3.5" aria-hidden />
        Explanation locked: this question was not answered.
      </p>
    );
  }
  if (source === null) return null;

  return (
    <details className="rounded-md bg-surface-sunken px-4 py-3" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-label uppercase text-ink-muted">Explanation</summary>
      {open && (
        <div className="mt-3">
          <Suspense fallback={<p className="text-body-sm text-ink-muted">Loading…</p>}>
            <Markdown source={source} />
          </Suspense>
        </div>
      )}
    </details>
  );
}
