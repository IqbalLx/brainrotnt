import { useState, type FormEvent } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AttemptResult, Phase, Problem } from "./useExercise";

interface ProblemCardProps {
  problem: Problem | null;
  phase: Phase;
  result: AttemptResult | null;
  message: string | null;
  onSubmit: (answer: string | number) => void;
  onNext: () => void;
}

export function ProblemCard({ problem, phase, result, message, onSubmit, onNext }: ProblemCardProps) {
  if (phase === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Can't reach the bridge</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={onNext}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (phase === "loading") {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardDescription>Loading a problem…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === "empty") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No problems here yet</CardTitle>
          <CardDescription>
            This subject has no problems in the bank. Run <code>bun run db:seed</code> or pick another subject.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!problem) return null;

  return <ActiveProblem key={problem.id} problem={problem} phase={phase} result={result} message={message} onSubmit={onSubmit} onNext={onNext} />;
}

function ActiveProblem({ problem, phase, result, message, onSubmit, onNext }: ProblemCardProps & { problem: Problem }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");

  const locked = phase === "submitting" || phase === "result";
  const canSubmit = !locked && (problem.type === "mcq" ? choice !== null : text.trim() !== "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(problem.type === "mcq" ? (choice as number) : text.trim());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{problem.subject}</Badge>
          <Badge variant="outline">{problem.topic}</Badge>
          <Badge variant="outline">difficulty {problem.difficulty}</Badge>
        </div>
        <CardTitle className="pt-2 text-lg leading-snug">{problem.statement}</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CardContent className="flex flex-col gap-3">
          {problem.type === "mcq" ? (
            <div role="radiogroup" className="flex flex-col gap-2">
              {problem.choices?.map((option, index) => (
                <Button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={choice === index}
                  variant={choice === index && !result ? "default" : "outline"}
                  disabled={locked}
                  onClick={() => setChoice(index)}
                  className={cn(
                    "h-auto justify-start whitespace-normal py-2 text-left",
                    choice === index && !result && "disabled:opacity-100",
                    result && choice === index && !result.correct && "border-destructive text-destructive disabled:opacity-100",
                    result && option === result.expected && "border-green-600 ring-2 ring-green-600/40 disabled:opacity-100",
                  )}
                >
                  {option}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                inputMode="decimal"
                placeholder={problem.unit ? `Your answer (unit: ${problem.unit})` : "Your answer"}
                value={text}
                disabled={locked}
                onChange={(e) => setText(e.target.value)}
                aria-label="Your answer"
              />
              {problem.unit && <span className="text-sm text-muted-foreground">{problem.unit}</span>}
            </div>
          )}

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}

          {result && (
            <div
              role="status"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                result.correct ? "border-green-600/40 text-green-700 dark:text-green-400" : "border-destructive/40 text-destructive",
              )}
            >
              {result.correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              <span>{result.correct ? "Correct." : `Not quite. The answer is ${result.expected}.`}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="gap-2">
          {phase === "result" ? (
            <Button type="button" autoFocus onClick={onNext}>
              Next problem
            </Button>
          ) : (
            <>
              <Button type="submit" disabled={!canSubmit}>
                {phase === "submitting" ? "Checking…" : "Submit"}
              </Button>
              <Button type="button" variant="ghost" onClick={onNext} disabled={phase === "submitting"}>
                Skip
              </Button>
            </>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
