import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProblemCard } from "../exercise-engine/ProblemCard";
import type { Settings } from "../settings/settings";
import { formatPoints, SUBJECT_LABEL } from "./format";
import { hrefFor } from "../shell/useRoute";
import { SessionProgress } from "./SessionProgress";
import type { useSession } from "./useSession";

interface SessionPanelProps {
  session: ReturnType<typeof useSession>;
  settings: Settings;
  agentWorking: boolean;
  onStart: () => void;
}

export function SessionPanel({ session, settings, agentWorking, onStart }: SessionPanelProps) {
  const { view, phase, result, message, flagged, score } = session;

  if (phase === "loading" || phase === "starting") {
    return (
      <Card aria-busy="true">
        <CardDescription>{phase === "starting" ? "Picking your questions…" : "Loading…"}</CardDescription>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Can't reach the bridge</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "none" || phase === "empty") {
    const subjects = settings.subjects.map((id) => SUBJECT_LABEL[id] ?? id).join(", ");
    const levels = settings.minDifficulty === settings.maxDifficulty ? `${settings.minDifficulty}` : `${settings.minDifficulty}–${settings.maxDifficulty}`;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{phase === "empty" ? "No problems match these settings" : "Ready when you are"}</CardTitle>
          <CardDescription>
            {phase === "empty" ? (
              <>
                Pick more subjects, widen the difficulty range, or run <code className="text-code">bun run db:seed</code>.
              </>
            ) : (
              "A session starts by itself when your agent starts working, or start one now."
            )}
          </CardDescription>
        </CardHeader>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
          {[
            ["Subjects", subjects],
            ["Questions", String(settings.sessionSize)],
            ["Difficulty", levels],
            ["Calculator", settings.calculator],
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline gap-2">
              <dt className="text-label uppercase text-ink-faint">{term}</dt>
              <dd className="text-code text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onStart}>
            <Play className="size-4" aria-hidden />
            Start session
          </Button>
          <Button asChild variant="ghost">
            <a href={hrefFor({ page: "bank" })}>Change settings</a>
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "ended" && score) {
    return (
      <Card aria-label="Session score">
        <CardHeader>
          <CardTitle>Session complete</CardTitle>
          <CardDescription>
            {formatPoints(score.score)} of {score.maxScore} points, {score.correct} correct.
            {agentWorking && " Your agent is still working."}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href={hrefFor({ page: "review", sessionId: score.id })}>Review answers</a>
          </Button>
          <Button onClick={onStart}>Start another session</Button>
        </div>
      </Card>
    );
  }

  if (!view?.current || (phase !== "answering" && phase !== "submitting" && phase !== "result")) return null;
  const last = view.items.every((item) => item.position === view.position || item.outcome !== null);

  return (
    <ProblemCard
        problem={view.current}
        phase={phase}
        result={result}
        message={message}
        flagged={flagged}
        calculatorCeiling={settings.calculator}
        onSubmit={session.submit}
        onFlag={session.flag}
        onNext={session.next}
        onSkip={session.skip}
        nextLabel={last ? "See your score" : "Next question"}
        hints={view.current.hints}
        hintCount={view.current.hintCount}
        openingHint={session.revealing}
        onOpenHint={session.revealHint}
        progress={
          <SessionProgress view={view} shownCredit={phase === "result" ? (result?.credit ?? null) : null} onEnd={session.end} disabled={phase === "submitting"} />
        }
      />
  );
}
