import { AgentStateBanner } from "@/features/agent-state/AgentStateBanner";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { ProblemCard } from "@/features/exercise-engine/ProblemCard";
import { useNextProblem } from "@/features/exercise-engine/useNextProblem";

export default function App() {
  const { event, status } = useAgentState();
  const { problem, error, next } = useNextProblem("math");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">brainrotnt</h1>
        <p className="text-sm text-muted-foreground">
          Brainrot, not. Solve STEM problems while your agent codes for you.
        </p>
      </header>
      <AgentStateBanner status={status} event={event} />
      <ProblemCard problem={problem} error={error} onNext={next} />
    </main>
  );
}
