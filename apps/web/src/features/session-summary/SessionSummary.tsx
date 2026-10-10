import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "../run-timer/timerState";
import type { SessionSummaryData } from "./useSessionSummary";

const SUBJECT_LABEL: Record<string, string> = { math: "Math", stats: "Stats", physics: "Physics", code: "Code" };

// An offer, not a gate: dismissible with the button or Escape.
export function SessionSummary({ summary, elapsedMs, onDismiss }: { summary: SessionSummaryData; elapsedMs: number; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <section
      aria-label="Session summary"
      className="fixed inset-x-6 top-16 z-20 mx-auto flex max-w-md flex-col gap-5 rounded-xl bg-surface-raised p-6 text-ink shadow-md"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-heading-lg">Session summary</h2>
        <Button variant="ghost" size="sm" onClick={onDismiss} autoFocus>
          Dismiss
        </Button>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-display-lg">{summary.attempts}</span>
        <span className="text-body-sm text-ink-muted">{summary.attempts === 1 ? "attempt" : "attempts"}</span>
      </div>

      <div className="flex gap-8">
        <div>
          <div className="text-display-sm">{summary.accuracyPercent}%</div>
          <div className="text-body-sm text-ink-muted">
            {summary.correct} of {summary.attempts} correct
          </div>
        </div>
        <div>
          <div className="text-display-sm">{formatElapsed(elapsedMs)}</div>
          <div className="text-body-sm text-ink-muted">elapsed</div>
        </div>
      </div>

      <ul className="flex flex-col gap-2 border-t border-border pt-4">
        {summary.bySubject.map((row) => (
          <li key={row.subject} className="flex justify-between text-body-sm">
            <span>{SUBJECT_LABEL[row.subject] ?? row.subject}</span>
            <span className="text-ink-muted">
              {row.correct} of {row.attempts} correct
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
