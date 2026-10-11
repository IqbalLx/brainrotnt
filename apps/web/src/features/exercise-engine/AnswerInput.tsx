import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttemptResult, Problem } from "./types";

interface AnswerInputProps {
  problem: Problem;
  text: string;
  choice: number | null;
  onText: (value: string) => void;
  onChoice: (index: number) => void;
  result: AttemptResult | null;
  locked: boolean;
}

const TINT = {
  correct: "border-success bg-success/15",
  incorrect: "border-danger bg-danger/15",
};

// Reflects the result it is handed; grading happens on the bridge.
export function AnswerInput({ problem, text, choice, onText, onChoice, result, locked }: AnswerInputProps) {
  return (
    <div className="flex flex-col gap-3">
      {problem.type === "mcq" ? (
        <div role="radiogroup" aria-label="Answer options" className="grid gap-3 sm:grid-cols-2">
          {problem.choices?.map((option, index) => {
            const isCorrect = result !== null && option === result.expected;
            const isWrongPick = result !== null && !result.correct && choice === index;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={choice === index}
                onClick={() => !locked && onChoice(index)}
                className={cn(
                  "flex items-start gap-2 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  !locked && "hover:border-border-strong hover:bg-surface-high",
                  choice === index && !result && "border-brand bg-brand/15",
                  isCorrect && TINT.correct,
                  isWrongPick && TINT.incorrect,
                )}
              >
                {isCorrect && <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct answer" />}
                {isWrongPick && <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Your answer" />}
                <span>
                  {String.fromCharCode(65 + index)}. {option}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className={cn(
            "flex h-12 items-center gap-2 rounded-lg border border-border bg-surface-sunken px-4 text-code-lg text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus-ring",
            result?.correct && TINT.correct,
            result && !result.correct && TINT.incorrect,
          )}
        >
          <input
            autoFocus
            inputMode={problem.type === "symbolic" ? "text" : "decimal"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Your answer"
            placeholder={problem.type === "symbolic" ? "Expression, e.g. 2x + 1" : "Your answer"}
            value={text}
            disabled={locked}
            onChange={(e) => onText(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-code-lg text-ink caret-info outline-none placeholder:text-ink-faint"
          />
          {problem.unit && <span className="rounded-md bg-surface-high px-2 py-0.5 text-code text-ink-muted">{problem.unit}</span>}
          {result?.correct && <Check className="size-4 text-success" aria-hidden />}
          {result && !result.correct && <X className="size-4 text-danger" aria-hidden />}
        </div>
      )}

      {problem.type === "symbolic" && !result && problem.variables && (
        <p className="text-body-sm text-ink-muted">Answer in terms of {problem.variables.join(", ")}. Any equivalent form is accepted.</p>
      )}

      {result && (
        <p role="status" className={cn("text-body-sm", result.correct ? "text-success" : "text-danger")}>
          {result.correct ? "Correct." : `Incorrect. Answer: ${result.expected}`}
        </p>
      )}
    </div>
  );
}
