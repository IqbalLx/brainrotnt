import { lazy, Suspense, useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { effectiveTier, type CalculatorTier } from "../settings/settings";
import { CodeAnswer } from "../code-editor/CodeAnswer";
import type { CodeLanguage, CodeSubmission } from "../code-editor/languages";
import { DrawingBoardPanel } from "../drawing-board/DrawingBoardPanel";
import { AnswerInput } from "./AnswerInput";
import { Hints } from "./Hints";
import type { AttemptResult, Phase, Problem } from "./types";

const CalculatorPanel = lazy(() => import("../calculator/CalculatorPanel"));

interface ProblemCardProps {
  problem: Problem;
  phase: Phase;
  result: AttemptResult | null;
  message: string | null;
  flagged: boolean;
  calculatorCeiling: CalculatorTier;
  onSubmit: (answer: string | number | CodeSubmission, toolsUsed: string[]) => void;
  onFlag: () => void;
  onNext: () => void;
  onSkip: () => void;
  /** What moving on is called after a result, e.g. "Next question" or "See your score". */
  nextLabel: string;
  hints: string[];
  hintCount: number;
  openingHint: boolean;
  onOpenHint: () => void;
}

export function ProblemCard(props: ProblemCardProps) {
  // Keyed by problem so every question starts from a clean slate.
  return <ActiveProblem key={props.problem.id} {...props} />;
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
  onSkip,
  nextLabel,
  hints,
  hintCount,
  openingHint,
  onOpenHint,
}: ProblemCardProps) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const codeView = problem.type === "code" ? problem.code : null;
  const [language, setLanguage] = useState<CodeLanguage>(codeView?.languages[0]?.language ?? "python");
  // Each language keeps its own draft, so switching back and forth loses nothing.
  const [drafts, setDrafts] = useState<Partial<Record<CodeLanguage, string>>>(() =>
    Object.fromEntries((codeView?.languages ?? []).map((l) => [l.language, l.starter])),
  );
  const starterOf = (lang: CodeLanguage) => codeView?.languages.find((l) => l.language === lang)?.starter ?? "";
  const draft = drafts[language] ?? "";
  const [usedCalculator, setUsedCalculator] = useState(false);
  const [usedDrawing, setUsedDrawing] = useState(false);
  const tier = effectiveTier(problem.tools.calculator, calculatorCeiling);

  const locked = phase === "submitting" || phase === "result";
  const canSubmit =
    !locked && (problem.type === "mcq" ? choice !== null : problem.type === "code" ? draft.trim() !== "" : text.trim() !== "");

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit) return;
    const answer = problem.type === "mcq" ? (choice as number) : problem.type === "code" ? { language, code: draft } : text.trim();
    onSubmit(answer, [
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

        <Hints hints={hints} hintCount={hintCount} canOpen={!locked} opening={openingHint} onOpen={onOpenHint} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {codeView ? (
            <CodeAnswer
              view={codeView}
              language={language}
              code={draft}
              onLanguage={setLanguage}
              onCode={(code) => setDrafts((current) => ({ ...current, [language]: code }))}
              onReset={() => setDrafts((current) => ({ ...current, [language]: starterOf(language) }))}
              onSubmit={() => canSubmit && handleSubmit()}
              result={result}
              locked={locked}
            />
          ) : (
            <AnswerInput
              problem={problem}
              text={text}
              choice={choice}
              onText={setText}
              onChoice={setChoice}
              result={result}
              locked={locked}
            />
          )}

          {message && (
            <p role="alert" className="text-body-sm text-danger">
              {message}
            </p>
          )}

          <div className="flex items-center gap-3">
            {phase === "result" ? (
              <Button type="button" autoFocus onClick={onNext}>
                {nextLabel}
              </Button>
            ) : (
              <>
                <Button type="submit" disabled={!canSubmit}>
                  {phase === "submitting" ? (problem.type === "code" ? "Running tests" : "Checking") : "Submit"}
                </Button>
                <Button type="button" variant="ghost" onClick={onSkip} disabled={phase === "submitting"}>
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
