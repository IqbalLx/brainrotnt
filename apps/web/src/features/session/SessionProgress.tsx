import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPoints } from "./format";
import type { SessionView } from "./useSession";

// "Question 2 of 5", one dot per question, and a way out.
interface SessionProgressProps {
  view: SessionView;
  /** The credit of the answer on screen, which the session view only counts after "Next". */
  shownCredit: number | null;
  onEnd: () => void;
  disabled: boolean;
}

export function SessionProgress({ view, shownCredit, onEnd, disabled }: SessionProgressProps) {
  const items = view.items.map((item) =>
    shownCredit !== null && item.position === view.position ? { ...item, outcome: "answered" as const, credit: shownCredit } : item,
  );
  const points = items.reduce((sum, item) => sum + (item.credit ?? 0), 0);
  const position = view.position ?? view.items.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <span className="text-code text-ink" aria-live="polite">
          Question {position + 1} of {view.size}
        </span>
        <ol aria-label="Questions" className="flex gap-1.5">
          {items.map((item) => (
            <li
              key={item.position}
              aria-label={`Question ${item.position + 1}: ${item.outcome === null ? (item.position === view.position ? "current" : "to do") : item.outcome === "skipped" ? "skipped" : item.credit ? "correct" : "incorrect"}`}
              className={cn(
                "size-2 rounded-full",
                item.outcome === null && item.position === view.position && "bg-brand",
                item.outcome === null && item.position !== view.position && "bg-border",
                item.outcome === "skipped" && "bg-ink-faint",
                item.outcome === "answered" && (item.credit ? "bg-success" : "bg-danger"),
              )}
            />
          ))}
        </ol>
        <span className="text-code text-ink-muted">{formatPoints(points)} pts</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onEnd} disabled={disabled}>
        End session
      </Button>
    </div>
  );
}
