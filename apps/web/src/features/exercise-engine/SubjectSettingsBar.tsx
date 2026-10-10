import { cn } from "@/lib/utils";

export const SUBJECTS = [
  { id: "math", label: "Math" },
  { id: "stats", label: "Stats" },
  { id: "physics", label: "Physics" },
] as const;

export type SubjectId = (typeof SUBJECTS)[number]["id"];

export function SubjectSettingsBar({ subject, onSubject }: { subject: SubjectId; onSubject: (id: SubjectId) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-6 py-4 shadow-sm">
      <div role="radiogroup" aria-label="Subject" className="flex items-center gap-2">
        {SUBJECTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={subject === id}
            onClick={() => onSubject(id)}
            className={cn(
              "rounded-full px-4 py-2 text-label uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
              subject === id ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
