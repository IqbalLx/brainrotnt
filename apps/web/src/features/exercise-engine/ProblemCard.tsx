import { lazy, Suspense, useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { effectiveTier, type CalculatorTier } from "../settings/settings";
import { DrawingBoardPanel } from "../drawing-board/DrawingBoardPanel";
import { AnswerInput } from "./AnswerInput";
import type { AttemptResult, Phase, Problem } from "./useExercise";

const CalculatorPanel = lazy(() => import("../calculator/CalculatorPanel"));

interface ProblemCardProps {
  problem: Problem | null;
  phase: Phase;
  result: AttemptResult | null;
  message: string | null;
  flagged: boolean;
  calculatorCeiling: CalculatorTier;
  onSubmit: (answer: string | number, toolsUsed: string[]) => void;
  onFlag: () => void;
  onNext: () => void;
}

export function ProblemCard(props: ProblemCardProps) {
  const { problem, phase, message, onNext } = props;

  if (phase === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Can't reach the bridge</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <div>
          <Button variant="outline" onClick={onNext}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (phase === "loading") {
    return (
      <Card aria-busy="true">
        <CardDescription>Loading a problem…</CardDescription>
      </Card>
    );
  }

  if (phase === "empty") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No problems match these settings</CardTitle>
          <CardDescription>
            Widen the difficulty range, pick another subject, or run <code className="text-code">bun run db:seed</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!problem) return null;
  return <ActiveProblem key={problem.id} {...props} problem={problem} />;
}

function DifficultyDots({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`Difficulty ${value} of 5`} className="ml-3 flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("size-[7px] rounded-full", n <= value ? "bg-ink-muted" : "bg-border")} />
      ))}
    </span>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function ActiveProblem({
  problem,
  phase,
  result,
  message,
  flagged,
  calculatorCeiling,
  onSubmit,
  onFlag,
  onNext,
}: ProblemCardProps & { problem: Problem }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [usedCalculator, setUsedCalculator] = useState(false);
  const [usedDrawing, setUsedDrawing] = useState(false);
  const tier = effectiveTier(problem.tools.calculator, calculatorCeiling);

  const locked = phase === "submitting" || phase === "result";
  const canSubmit = !locked && (problem.type === "mcq" ? choice !== null : text.trim() !== "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(problem.type === "mcq" ? (choice as number) : text.trim(), [
      ...(usedCalculator ? ["calculator"] : []),
      ...(usedDrawing ? ["draw"] : []),
    ]);
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Badge variant="brand">{problem.subject}</Badge>
            <DifficultyDots value={problem.difficulty} />
          </div>
          <Button variant={flagged ? "flagged" : "outline"} size="sm" disabled={flagged} onClick={onFlag}>
            <Flag className="size-4" aria-hidden />
            {flagged ? "Flagged" : "Flag"}
          </Button>
        </div>

        <p className="text-body text-ink">{problem.statement}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <AnswerInput
            problem={problem}
            text={text}
            choice={choice}
            onText={setText}
            onChoice={setChoice}
            result={result}
            locked={locked}
          />

          {message && (
            <p role="alert" className="text-body-sm text-danger">
              {message}
            </p>
          )}

          <div className="flex items-center gap-3">
            {phase === "result" ? (
              <Button type="button" autoFocus onClick={onNext}>
                Next problem
              </Button>
            ) : (
              <>
                <Button type="submit" disabled={!canSubmit}>
                  {phase === "submitting" ? "Checking" : "Submit"}
                </Button>
                <Button type="button" variant="ghost" onClick={onNext} disabled={phase === "submitting"}>
                  Skip
                </Button>
              </>
            )}
          </div>
        </form>

        <div className="flex gap-3 border-t border-border pt-4">
          <Badge variant="muted">Calculator: {capitalize(tier)}</Badge>
          <Badge variant="muted">Draw: {problem.tools.draw ? "on" : "off"}</Badge>
        </div>
      </Card>
      {problem.tools.draw && <DrawingBoardPanel onDraw={() => setUsedDrawing(true)} />}
      {tier !== "none" && (
        <Suspense fallback={null}>
          <CalculatorPanel tier={tier} onUsed={() => setUsedCalculator(true)} />
        </Suspense>
      )}
    </>
  );
}
