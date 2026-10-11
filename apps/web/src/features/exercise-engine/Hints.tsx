import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

const PENALTY = 0.25;

interface HintsProps {
  hints: string[];
  hintCount: number;
  canOpen: boolean;
  opening: boolean;
  onOpen: () => void;
}

// Hints open one at a time; the cost of the next one is shown before it is opened.
export function Hints({ hints, hintCount, canOpen, opening, onOpen }: HintsProps) {
  if (hintCount === 0) return null;
  const next = hints.length + 1;
  const creditAfter = Math.max(0, 1 - PENALTY * next);

  return (
    <section aria-label="Hints" className="flex flex-col gap-3">
      {hints.length > 0 && (
        <ol className="flex flex-col gap-2">
          {hints.map((hint, index) => (
            <li key={index} className="flex gap-3 rounded-md bg-surface-sunken px-4 py-3 text-body-sm text-ink">
              <span className="shrink-0 text-label uppercase text-ink-muted">Hint {index + 1}</span>
              <span>{hint}</span>
            </li>
          ))}
        </ol>
      )}
      {canOpen && hints.length < hintCount && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onOpen} disabled={opening}>
            <Lightbulb className="size-4" aria-hidden />
            Hint {next} of {hintCount}
          </Button>
          <span className="text-body-sm text-ink-muted">A correct answer will then be worth {creditAfter} point{creditAfter === 1 ? "" : "s"}.</span>
        </div>
      )}
    </section>
  );
}
