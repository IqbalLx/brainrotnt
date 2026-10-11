import { lazy, Suspense } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttemptResult } from "../exercise-engine/types";
import { formatCall, LANGUAGE_LABEL, literal, type CodeLanguage, type CodeView, type TrialOutcome } from "./languages";

// CodeMirror is large, so it is only fetched when a programming problem is shown.
const CodeEditor = lazy(() => import("./CodeEditor"));

interface CodeAnswerProps {
  view: CodeView;
  language: CodeLanguage;
  code: string;
  onLanguage: (language: CodeLanguage) => void;
  onCode: (code: string) => void;
  onReset: () => void;
  onSubmit: () => void;
  onTry?: () => void;
  /** The last trial run in this language, if any. */
  trial: TrialOutcome | null;
  result: AttemptResult | null;
  locked: boolean;
}

export function CodeAnswer({ view, language, code, onLanguage, onCode, onReset, onSubmit, onTry, trial, result, locked }: CodeAnswerProps) {
  const starter = view.languages.find((l) => l.language === language)?.starter ?? "";

  return (
    <div className="flex flex-col gap-4">
      {view.examples.length > 0 && <TestCases view={view} language={language} trial={trial} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {view.languages.length > 1 ? (
          <div role="radiogroup" aria-label="Language" className="flex items-center gap-2">
            {view.languages.map((option) => (
              <button
                key={option.language}
                type="button"
                role="radio"
                aria-checked={language === option.language}
                disabled={locked}
                onClick={() => onLanguage(option.language)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  language === option.language ? "border-brand/50 bg-brand/15 text-brand-ink" : "border-border text-ink-muted hover:bg-surface-high hover:text-ink",
                )}
              >
                {LANGUAGE_LABEL[option.language]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-label uppercase text-ink-muted">{LANGUAGE_LABEL[language]}</span>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={locked || code === starter} onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden />
          Reset to starter
        </Button>
      </div>

      <Suspense fallback={<div className="grid h-40 place-items-center rounded-md bg-surface-sunken text-body-sm text-ink-muted">Loading the editor…</div>}>
        <CodeEditor
          key={language}
          language={language}
          value={code}
          onChange={onCode}
          onSubmit={onSubmit}
          onTry={onTry}
          readOnly={locked}
          label={`${LANGUAGE_LABEL[language]} code for ${view.entry}`}
        />
      </Suspense>
      <p id="code-editor-help" className="text-body-sm text-ink-muted">
        {onTry ? "Ctrl or ⌘ with ' runs the tests shown; with Enter it submits." : "Ctrl or ⌘ with Enter submits."} Press Esc, then Tab, to move focus out of
        the editor.
      </p>

      {result && (
        <div role="status" className="flex flex-col gap-3">
          <p className={cn("text-body-sm", result.correct ? "text-success" : "text-danger")}>
            {result.correct ? "Correct." : "Incorrect."} {result.detail}
          </p>
          <details className="rounded-md bg-surface-sunken px-4 py-3">
            <summary className="cursor-pointer text-label uppercase text-ink-muted">Reference solution</summary>
            <pre className="mt-3 overflow-x-auto text-code text-ink">{result.expected}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// The tests shown for this problem, marked passed or failed after a trial run. More tests may run on submit.
function TestCases({ view, language, trial }: { view: CodeView; language: CodeLanguage; trial: TrialOutcome | null }) {
  const results = trial?.status === "ran" ? trial.results : null;
  const passed = results?.filter((r) => r.passed).length ?? 0;
  return (
    <section aria-label="Test cases" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-label uppercase text-ink-muted">Test cases</h3>
        {results && (
          <span role="status" className={cn("text-body-sm", passed === results.length ? "text-success" : "text-danger")}>
            Passed {passed} of {results.length}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1 rounded-md bg-surface-sunken px-4 py-3 text-code text-ink">
        {view.examples.map((example, index) => {
          const run = results?.[index];
          return (
            <li key={index} className="flex items-start gap-2">
              {run ? (
                run.passed ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="passed" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="failed" />
                )
              ) : null}
              <span className="min-w-0 break-words">
                {formatCall(language, view.entry, example.args)} <span className="text-ink-muted">returns</span> {literal(language, example.expected)}
                {run && !run.passed && (
                  <span className="block text-danger">{run.got.startsWith("raised") ? run.got : `but got ${run.got}`}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {trial?.status === "error" && (
        <p role="alert" className="text-body-sm text-danger">
          {trial.message}
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        {view.moreTests > 0
          ? `Run tests checks these ${view.examples.length === 1 ? "one" : view.examples.length}. Submitting also runs ${view.moreTests} hidden ${view.moreTests === 1 ? "test" : "tests"}.`
          : "These are all the tests: submitting runs exactly these."}
      </p>
    </section>
  );
}
