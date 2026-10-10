import { AgentStateBadge, BlockedBanner } from "@/features/agent-state/AgentStatus";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { ProblemCard } from "@/features/exercise-engine/ProblemCard";
import { SubjectSettingsBar } from "@/features/exercise-engine/SubjectSettingsBar";
import { useExercise } from "@/features/exercise-engine/useExercise";
import { useSettings } from "@/features/settings/useSettings";
import { RunTimer } from "@/features/run-timer/RunTimer";
import { useRunTimer } from "@/features/run-timer/useRunTimer";
import { SessionSummary } from "@/features/session-summary/SessionSummary";
import { useSessionSummary } from "@/features/session-summary/useSessionSummary";

export default function App() {
  const { event, status } = useAgentState();
  const { settings, update } = useSettings();
  const exercise = useExercise(settings.subject, { min: settings.minDifficulty, max: settings.maxDifficulty }, status);
  const timer = useRunTimer(status);
  const { summary, dismiss } = useSessionSummary(status, timer.runId, timer.startedAt);

  return (
    <>
      {status === "blocked" && <BlockedBanner event={event} />}
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-heading-lg">brainrotnt</h1>
            <p className="text-body-sm text-ink-muted">Brainrot, not. Solve STEM problems while your agent codes for you.</p>
          </div>
          <AgentStateBadge status={status} />
        </header>
        <RunTimer elapsedMs={timer.elapsedMs} />
        <SubjectSettingsBar settings={settings} onChange={update} />
        <ProblemCard
          problem={exercise.problem}
          phase={exercise.phase}
          result={exercise.result}
          message={exercise.message}
          flagged={exercise.flagged}
          calculatorCeiling={settings.calculator}
          onSubmit={exercise.submit}
          onFlag={exercise.flag}
          onNext={exercise.next}
        />
      </main>
      {summary && <SessionSummary summary={summary} elapsedMs={timer.elapsedMs} onDismiss={dismiss} />}
    </>
  );
}
