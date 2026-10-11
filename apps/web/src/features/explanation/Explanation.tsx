import { lazy, Suspense } from "react";

// The Markdown and KaTeX renderer is only fetched when an explanation is first shown.
const Markdown = lazy(() => import("./Markdown"));

/** The rendered explanation, fetching the renderer on first use. */
export function ExplanationBody({ source }: { source: string }) {
  return (
    <Suspense fallback={<p className="text-body-sm text-ink-muted">Loading…</p>}>
      <Markdown source={source} />
    </Suspense>
  );
}
