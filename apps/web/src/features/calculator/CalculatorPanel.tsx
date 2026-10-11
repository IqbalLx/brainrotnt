import { useRef, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { calculate, tierRank, type CalculatorTier } from "@brainrotnt/math-engine";
import type { CalculatorState } from "./calculatorState";
import { BASIC_KEYS, FUNCTION_KEYS, type CalcKey } from "./keys";

const TIER_LABEL: Record<CalculatorTier, string> = { none: "None", basic: "Basic", scientific: "Scientific", stats: "Stats" };

const keyClass =
  "h-9 rounded-md bg-surface-high/60 text-code text-ink transition-colors hover:bg-surface-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-surface-high/60";

// A tool the person reached for. It only ever reflects the tier it is handed.
interface CalculatorPanelProps {
  tier: Exclude<CalculatorTier, "none">;
  /** Shared by every panel showing this problem's calculator (see calculatorState). */
  state: CalculatorState;
  onUsed: () => void;
  /** Puts a result into the answer box, when the problem takes a typed answer. */
  onCopy?: (value: string) => void;
}

export default function CalculatorPanel({ tier, state, onUsed, onCopy }: CalculatorPanelProps) {
  const { expression, result, setExpression, setResult } = state;
  const input = useRef<HTMLInputElement>(null);

  function edit(next: string, caret: number) {
    setExpression(next);
    setResult(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(caret, caret);
    });
  }

  function insert(text: string) {
    const start = input.current?.selectionStart ?? expression.length;
    const end = input.current?.selectionEnd ?? expression.length;
    edit(expression.slice(0, start) + text + expression.slice(end), start + text.length);
  }

  function backspace() {
    const start = input.current?.selectionStart ?? expression.length;
    const end = input.current?.selectionEnd ?? expression.length;
    if (start !== end) return edit(expression.slice(0, start) + expression.slice(end), start);
    if (start > 0) edit(expression.slice(0, start - 1) + expression.slice(start), start - 1);
  }

  function evaluate() {
    const next = calculate(expression, tier);
    setResult(next);
    if (next.ok) onUsed();
  }

  const renderKey = (key: CalcKey) => (
    <button
      key={key.label}
      type="button"
      aria-label={key.aria}
      disabled={tierRank(tier) < tierRank(key.minTier)}
      onClick={() => insert(key.insert)}
      className={keyClass}
    >
      {key.label}
    </button>
  );

  return (
    <section aria-label="Calculator" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge variant="ink">{TIER_LABEL[tier]}</Badge>
        {tierRank(tier) >= tierRank("scientific") && <span className="text-body-sm text-ink-muted">Angles in radians</span>}
      </div>

      <div className="flex flex-col gap-1">
        <input
          ref={input}
          aria-label="Expression"
          autoComplete="off"
          spellCheck={false}
          placeholder="Expression"
          value={expression}
          maxLength={200}
          onChange={(e) => {
            setExpression(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              evaluate();
            }
          }}
          className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-code text-ink caret-info outline-none placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
        <div role="status" aria-live="polite" className="flex min-h-7 items-center justify-between gap-3 px-1">
          {result?.ok && <span className="text-code-lg text-success">= {result.text}</span>}
          {result && !result.ok && <span className="text-body-sm text-ink-muted">{result.error}</span>}
          {result?.ok && onCopy && (
            <button type="button" onClick={() => onCopy(result.text)} className="text-body-sm text-info hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">
              Copy to answer
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">{FUNCTION_KEYS.map(renderKey)}</div>
      <div className="grid grid-cols-5 gap-2">{BASIC_KEYS.map(renderKey)}</div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={keyClass} onClick={() => edit("", 0)}>
          C
        </button>
        <button type="button" aria-label="Backspace" className={keyClass} onClick={backspace}>
          ⌫
        </button>
        <button type="button" aria-label="Evaluate" className={cn(keyClass, "bg-brand text-on-brand hover:bg-brand hover:brightness-110")} onClick={evaluate}>
          =
        </button>
      </div>
    </section>
  );
}
