import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { effectiveTier, type CalculatorTier } from "../settings/settings";
import { CodeAnswer } from "../code-editor/CodeAnswer";
import type { CodeLanguage, CodeSubmission } from "../code-editor/languages";
import { DrawingBoardPanel } from "../drawing-board/DrawingBoardPanel";
import { SUBJECT_LABEL } from "../session/format";
import { formatElapsed } from "../run-timer/timerState";
import { AnswerInput } from "./AnswerInput";
import { Hints } from "./Hints";
import { ToolsPanel } from "./ToolsPanel";
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
  /** Session progress, shown at the right of the ribbon. */
  progress?: ReactNode;
}

export function ProblemCard(props: ProblemCardProps) {
  // Keyed by problem so every question starts from a clean slate.
  return <ActiveProblem key={props.problem.id} {...props} />;
}

// Counts up while the question is on screen; stops once it is answered.
function useQuestionClock(running: boolean) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  return now - startedAt;
}

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
  progress,
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
  const elapsed = useQuestionClock(phase !== "result");

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

  const hintsPanel = <Hints hints={hints} hintCount={hintCount} canOpen={!locked} opening={openingHint} onOpen={onOpenHint} />;
  const calculator =
    tier === "none" ? null : (
      <Suspense fallback={<p className="text-body-sm text-ink-muted">Loading the calculator…</p>}>
        <CalculatorPanel
          tier={tier}
          onUsed={() => setUsedCalculator(true)}
          onCopy={problem.type === "numeric" || problem.type === "symbolic" ? (value) => !locked && setText(value) : undefined}
        />
      </Suspense>
    );
  // Code needs the full width for the editor; everything else gets a tools column beside it.
  const split = !codeView && (calculator !== null || hintCount > 0);
  const long = problem.statement.length > 220;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="font-medium text-ink">{SUBJECT_LABEL[problem.subject] ?? problem.subject}</span>
          <span className="text-ink-faint">/</span>
          <span className="text-ink-muted">{problem.topic}</span>
          <span className="text-ink-faint" aria-hidden>
            ·
          </span>
          <Badge variant="info" aria-label={`Difficulty ${problem.difficulty} of 5`}>
            Diff {problem.difficulty} / 5
          </Badge>
          {problem.unverified && (
            <Badge variant="blocked" title="Fewer than two independent sources confirm this fact. Flag it if it looks wrong.">
              Unverified
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span role="timer" aria-label="Time on this question" className="text-code text-ink-muted">
            {formatElapsed(elapsed)}
          </span>
          {progress}
        </div>
      </div>

      <div className={cn("grid items-start gap-8", split && "lg:grid-cols-12")}>
        <div className={cn("flex flex-col gap-6", split && "lg:col-span-7")}>
          <div className="flex items-start justify-between gap-4">
            <p className={cn("text-ink", long ? "text-heading-sm font-normal leading-relaxed" : "text-heading-lg font-normal leading-snug")}>
              {problem.statement}
            </p>
            <Button variant={flagged ? "flagged" : "ghost"} size="sm" disabled={flagged} onClick={onFlag} className="shrink-0">
              <Flag className="size-4" aria-hidden />
              {flagged ? "Flagged" : "Flag"}
            </Button>
          </div>

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
              <AnswerInput problem={problem} text={text} choice={choice} onText={setText} onChoice={setChoice} result={result} locked={locked} />
            )}

            {message && (
              <p role="alert" className="text-body-sm text-danger">
                {message}
              </p>
            )}

            <div className="flex items-center gap-3">
              {phase === "result" ? (
                <Button key="next" type="button" autoFocus onClick={onNext} className="h-11 px-6">
                  {nextLabel}
                </Button>
              ) : (
                <>
                  <Button type="submit" disabled={!canSubmit} className="h-11 px-6">
                    {phase === "submitting" ? (problem.type === "code" ? "Running tests" : "Checking") : "Submit"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={onSkip} disabled={phase === "submitting"}>
                    Skip
                  </Button>
                </>
              )}
            </div>
          </form>

          {!split && hintsPanel}
          {problem.tools.draw && <DrawingBoardPanel onDraw={() => setUsedDrawing(true)} />}
        </div>

        {split && (
          <div className="lg:sticky lg:top-20 lg:col-span-5">
            <ToolsPanel
              tabs={[
                ...(calculator ? [{ id: "calculator", label: "Calculator", content: calculator }] : []),
                ...(hintCount > 0 ? [{ id: "hints", label: `Hints ${hints.length}/${hintCount}`, content: hintsPanel }] : []),
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
