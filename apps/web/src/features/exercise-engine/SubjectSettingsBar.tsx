import { cn } from "@/lib/utils";
import { CALCULATOR_TIERS, setDifficultyBound, type CalculatorTier, type Settings, type SubjectId } from "../settings/settings";

const SUBJECTS: { id: SubjectId; label: string }[] = [
  { id: "math", label: "Math" },
  { id: "stats", label: "Stats" },
  { id: "physics", label: "Physics" },
];

const TIER_LABEL: Record<CalculatorTier, string> = { none: "None", basic: "Basic", scientific: "Scientific", stats: "Stats" };

export function SubjectSettingsBar({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const { subject, minDifficulty, maxDifficulty, calculator } = settings;
  const rangeText = minDifficulty === maxDifficulty ? `${minDifficulty}` : `${minDifficulty} to ${maxDifficulty}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-lg bg-surface-raised px-6 py-4 shadow-sm">
      <div role="radiogroup" aria-label="Subject" className="flex items-center gap-2">
        {SUBJECTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={subject === id}
            onClick={() => onChange({ subject: id })}
            className={cn(
              "rounded-full px-4 py-2 text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              subject === id ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Difficulty range" className="flex items-center gap-1">
          <span className="mr-1 text-body-sm text-ink-muted">Difficulty</span>
          {[1, 2, 3, 4, 5].map((level) => {
            const inRange = level >= minDifficulty && level <= maxDifficulty;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={inRange}
                aria-label={`Level ${level}`}
                onClick={() => onChange(renameRange(setDifficultyBound({ min: minDifficulty, max: maxDifficulty }, level)))}
                className="grid size-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className={cn("size-2.5 rounded-full transition-colors", inRange ? "bg-brand" : "bg-border")} />
              </button>
            );
          })}
          <span className="sr-only" role="status">
            Difficulty {rangeText}
          </span>
        </div>

        <div className="hidden h-7 w-px bg-border sm:block" aria-hidden />

        <label className="flex items-center gap-2">
          <span className="text-body-sm text-ink-muted">Calculator</span>
          <select
            value={calculator}
            onChange={(e) => onChange({ calculator: e.target.value as CalculatorTier })}
            className="cursor-pointer appearance-none rounded-full bg-surface-sunken px-3 py-1 text-label uppercase text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {CALCULATOR_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABEL[tier]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function renameRange(range: { min: number; max: number }) {
  return { minDifficulty: range.min, maxDifficulty: range.max };
}
