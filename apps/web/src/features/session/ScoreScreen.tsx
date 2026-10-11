import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Explanation } from "../explanation/Explanation";
import { END_REASON_LABEL, formatPoints, SUBJECT_LABEL } from "./format";
import type { SessionScore } from "./useSession";

const OUTCOME = {
  correct: { icon: Check, label: "Correct", className: "text-success" },
  incorrect: { icon: X, label: "Incorrect", className: "text-danger" },
  skipped: { icon: Minus, label: "Skipped", className: "text-ink-muted" },
  unanswered: { icon: Minus, label: "Not answered", className: "text-ink-faint" },
};

export function ScoreScreen({ score, onStartAnother, agentWorking }: { score: SessionScore; onStartAnother: () => void; agentWorking: boolean }) {
  return (
    <Card aria-label="Session score">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-heading-lg">Session score</h2>
        {score.endReason && <Badge variant="muted">{END_REASON_LABEL[score.endReason]}</Badge>}
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-display-lg">{formatPoints(score.score)}</span>
        <span className="text-body text-ink-muted">of {score.maxScore} points</span>
      </div>
      <p className="text-body-sm text-ink-muted">
        {score.correct} correct of {score.maxScore}. Each hint takes a quarter point off a correct answer.
      </p>

      <ol className="flex flex-col divide-y divide-border">
        {score.items.map((item) => {
          const kind = item.outcome === "answered" ? (item.correct ? "correct" : "incorrect") : item.outcome;
          const { icon: Icon, label, className } = OUTCOME[kind];
          return (
            <li key={item.position} className="flex items-start gap-3 py-3">
              <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-label={label} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="line-clamp-2 text-body-sm text-ink">{item.statement}</p>
                <p className="text-body-sm text-ink-muted">
                  {SUBJECT_LABEL[item.subject] ?? item.subject} · {item.topic}
                  {item.hintsUsed > 0 && ` · ${item.hintsUsed} ${item.hintsUsed === 1 ? "hint" : "hints"}`}
                </p>
                <Explanation source={item.explanation} locked={item.hasExplanation && item.explanation === null} />
              </div>
              <span className="shrink-0 text-body-sm text-ink">{formatPoints(item.credit)}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button autoFocus onClick={onStartAnother}>
          Start another session
        </Button>
        {agentWorking && <span className="text-body-sm text-ink-muted">Your agent is still working.</span>}
      </div>
    </Card>
  );
}
