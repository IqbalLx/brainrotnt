import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Clock, Lightbulb, Lock, Minus, Target, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, SectionLabel } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExplanationBody } from "../explanation/Explanation";
import { describeAnswer, END_REASON_LABEL, formatDuration, formatPoints, SUBJECT_LABEL } from "../session/format";
import type { SessionScore } from "../session/useSession";
import { hrefFor } from "../shell/useRoute";
import { useReview, type SessionSummaryRow } from "./useReview";

type Item = SessionScore["items"][number];

const OUTCOME = {
  correct: { label: "Correct", variant: "success", icon: Check },
  incorrect: { label: "Incorrect", variant: "danger", icon: X },
  skipped: { label: "Skipped", variant: "muted", icon: Minus },
  unanswered: { label: "Not answered", variant: "muted", icon: Minus },
} as const;

const outcomeOf = (item: Item) => (item.outcome === "answered" ? (item.correct ? "correct" : "incorrect") : item.outcome);

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });

function StatCard({ label, icon, value, unit, note }: { label: string; icon: ReactNode; value: string; unit?: string; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-ink-faint" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-display-lg text-ink">{value}</span>
        {unit && <span className="text-body-sm text-ink-muted">{unit}</span>}
      </div>
      {note && <div className="text-caption text-ink-muted">{note}</div>}
    </div>
  );
}

function ReviewItem({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  const outcome = OUTCOME[outcomeOf(item)];
  const answer = describeAnswer(item.answerGiven);
  const code = typeof item.answerGiven === "object" && item.answerGiven !== null && "code" in item.answerGiven ? String((item.answerGiven as { code: unknown }).code) : null;
  const panelId = `review-item-${item.position}`;

  return (
    <li className="rounded-lg border border-border bg-surface-raised">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-4 p-4 text-left focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border text-code", outcome.variant === "danger" ? "border-danger/40 text-danger" : "border-border text-ink-muted")}>
          {String(item.position + 1).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label uppercase text-ink-faint">
              {SUBJECT_LABEL[item.subject] ?? item.subject} · {item.topic}
            </span>
            <Badge variant={outcome.variant}>
              {outcome.label}
              {item.secondsSpent !== null && ` · ${formatDuration(item.secondsSpent)}`}
              {item.hintsUsed > 0 && ` · ${item.hintsUsed} ${item.hintsUsed === 1 ? "hint" : "hints"}`}
            </Badge>
          </div>
          <p className={cn("text-body text-ink", !open && "line-clamp-1")}>{item.statement}</p>
        </div>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-code text-ink">{formatPoints(item.credit)}</span>
          <ChevronDown className={cn("size-4 text-ink-muted transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border p-4 pl-16">
          {answer && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Your answer</SectionLabel>
              {code ? (
                <pre className="overflow-x-auto rounded-md border border-border bg-surface-sunken p-3 text-code text-ink">{code}</pre>
              ) : (
                <span className="text-code-lg text-ink">{answer}</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Explanation</SectionLabel>
            {item.explanation !== null ? (
              <div className="rounded-md border border-border bg-surface-sunken p-4">
                <ExplanationBody source={item.explanation} />
              </div>
            ) : item.hasExplanation ? (
              <p className="flex items-center gap-2 text-body-sm text-ink-faint">
                <Lock className="size-3.5" aria-hidden />
                Explanation locked: this question was not answered.
              </p>
            ) : (
              <p className="text-body-sm text-ink-faint">This problem has no explanation yet.</p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function SessionPicker({ sessions, current }: { sessions: SessionSummaryRow[]; current: string }) {
  if (sessions.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-body-sm text-ink-muted">
      <span>Session</span>
      <select
        value={current}
        onChange={(e) => (window.location.hash = hrefFor({ page: "review", sessionId: e.target.value }))}
        className="rounded-md border border-border bg-surface-raised px-2 py-1 text-code text-ink focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {when(s.endedAt)} · {formatPoints(s.score)}/{s.size}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReviewPage({ sessionId, refresh, onStartAnother }: { sessionId: string | null; refresh: unknown; onStartAnother: () => void }) {
  const state = useReview(sessionId, refresh);
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  if (state.status === "loading") {
    return (
      <Card aria-busy="true">
        <CardDescription>Loading…</CardDescription>
      </Card>
    );
  }
  if (state.status === "error" || state.status === "empty") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{state.status === "empty" ? "Nothing to review yet" : "Can't load this review"}</CardTitle>
          <CardDescription>{state.status === "empty" ? "Finish or end a session and its review appears here." : state.message}</CardDescription>
        </CardHeader>
        <div>
          <Button variant="outline" onClick={() => (window.location.hash = hrefFor({ page: "exercise" }))}>
            Go to exercise
          </Button>
        </div>
      </Card>
    );
  }

  const { score, sessions } = state;
  const accuracy = score.answered > 0 ? Math.round((score.correct / score.answered) * 100) : null;
  const toggle = (position: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={score.endReason === "completed" ? "success" : "muted"}>
              Session · {score.endReason ? END_REASON_LABEL[score.endReason] : "Ended"}
            </Badge>
            <span className="text-code text-ink-faint">{when(score.startedAt)}</span>
          </div>
          <h2 className="text-display-lg font-sans text-ink">Session review</h2>
          <p className="text-body text-ink-muted">
            {score.maxScore} {score.maxScore === 1 ? "question" : "questions"} · {formatDuration(score.secondsSpent)} spent answering
          </p>
        </div>
        <SessionPicker sessions={sessions} current={score.id} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Accuracy"
          icon={<Target className="size-4" />}
          value={accuracy === null ? "–" : `${accuracy}%`}
          unit={`${score.correct} / ${score.answered}`}
          note={
            <div className="h-1 overflow-hidden rounded-full bg-surface-high">
              <div className="h-full bg-success" style={{ width: `${accuracy ?? 0}%` }} />
            </div>
          }
        />
        <StatCard label="Points" icon={<Check className="size-4" />} value={formatPoints(score.score)} unit={`of ${score.maxScore}`} note={`${score.maxScore - score.answered} skipped or unanswered`} />
        <StatCard
          label="Focused time"
          icon={<Clock className="size-4" />}
          value={formatDuration(score.secondsSpent)}
          note={score.answered > 0 ? `${formatDuration(score.secondsSpent / score.answered)} per answer` : undefined}
        />
        <StatCard
          label="Hints used"
          icon={<Lightbulb className="size-4" />}
          value={String(score.hintsUsed)}
          unit={score.hintsUsed === 1 ? "hint" : "hints"}
          note={
            <span className="flex flex-wrap gap-1">
              {score.subjects.map((subject) => (
                <Badge key={subject} variant="muted">
                  {SUBJECT_LABEL[subject] ?? subject}
                </Badge>
              ))}
            </span>
          }
        />
      </div>

      <section aria-label="Solutions and explanations" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <SectionLabel>Deep dives</SectionLabel>
            <h3 className="text-heading-lg text-ink">Answers and explanations</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(open.size === score.items.length ? new Set() : new Set(score.items.map((i) => i.position)))}>
            {open.size === score.items.length ? "Collapse all" : "Expand all"}
          </Button>
        </div>
        <ol className="flex flex-col gap-3">
          {score.items.map((item) => (
            <ReviewItem key={item.position} item={item} open={open.has(item.position)} onToggle={() => toggle(item.position)} />
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface-raised p-5">
        <div className="flex flex-col gap-1">
          <span className="text-heading-sm text-ink">Keep the momentum</span>
          <span className="text-body-sm text-ink-muted">
            {formatPoints(score.score)} of {score.maxScore} {score.maxScore === 1 ? "point" : "points"} this time.
          </span>
        </div>
        <Button onClick={onStartAnother} className="h-10 px-5">
          Start next session
        </Button>
      </div>
    </div>
  );
}
