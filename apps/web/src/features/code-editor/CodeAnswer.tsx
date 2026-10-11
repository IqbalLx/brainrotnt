import { lazy, Suspense } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttemptResult } from "../exercise-engine/types";
import { formatCall, LANGUAGE_LABEL, literal, type CodeLanguage, type CodeView } from "./languages";

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
  result: AttemptResult | null;
  locked: boolean;
}

export function CodeAnswer({ view, language, code, onLanguage, onCode, onReset, onSubmit, result, locked }: CodeAnswerProps) {
  const starter = view.languages.find((l) => l.language === language)?.starter ?? "";

  return (
    <div className="flex flex-col gap-4">
      {view.examples.length > 0 && (
        <section aria-label="Examples" className="flex flex-col gap-2">
          <h3 className="text-label uppercase text-ink-muted">Examples</h3>
          <ul className="flex flex-col gap-1 rounded-md bg-surface-sunken px-4 py-3 text-code text-ink">
            {view.examples.map((example, index) => (
              <li key={index}>
                {formatCall(language, view.entry, example.args)} <span className="text-ink-muted">returns</span> {literal(language, example.expected)}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  "rounded-full px-4 py-1.5 text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  language === option.language ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted hover:text-ink",
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
          readOnly={locked}
          label={`${LANGUAGE_LABEL[language]} code for ${view.entry}`}
        />
      </Suspense>
      <p id="code-editor-help" className="text-body-sm text-ink-muted">
        Ctrl or ⌘ with Enter runs the tests. Press Esc, then Tab, to move focus out of the editor.
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
