import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentStateBanner } from "@/features/agent-state/AgentStateBanner";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { ProblemCard } from "@/features/exercise-engine/ProblemCard";
import { useExercise } from "@/features/exercise-engine/useExercise";

const SUBJECTS = ["math", "stats", "physics"] as const;

export default function App() {
  const { event, status } = useAgentState();
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("math");
  const exercise = useExercise(subject, status);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">brainrotnt</h1>
        <p className="text-sm text-muted-foreground">
          Brainrot, not. Solve STEM problems while your agent codes for you.
        </p>
      </header>
      <AgentStateBanner status={status} event={event} />
      <div className="flex gap-2" role="group" aria-label="Subject">
        {SUBJECTS.map((s) => (
          <Button key={s} size="sm" variant={s === subject ? "default" : "outline"} onClick={() => setSubject(s)}>
            {s}
          </Button>
        ))}
      </div>
      <ProblemCard
        problem={exercise.problem}
        phase={exercise.phase}
        result={exercise.result}
        message={exercise.message}
        onSubmit={exercise.submit}
        onNext={exercise.next}
      />
    </main>
  );
}
