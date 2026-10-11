// 3.75, 1 and 0.5 rather than 3.750000001 or 1.00.
export function formatPoints(points: number): string {
  return String(Math.round(points * 100) / 100);
}

export const SUBJECT_LABEL: Record<string, string> = { math: "Math", stats: "Stats", physics: "Physics", code: "Code", trivia: "Trivia" };

export const END_REASON_LABEL = { completed: "Completed", ended_early: "Ended early", abandoned: "Abandoned" } as const;

// 754 seconds -> "12m 34s"; under a minute -> "45s".
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m ${String(total % 60).padStart(2, "0")}s` : `${total}s`;
}

/** What someone submitted, written for reading back: an option letter, the text, or the language. */
export function describeAnswer(given: unknown): string | null {
  if (given === null || given === undefined) return null;
  if (typeof given === "number") return `Option ${String.fromCharCode(65 + given)}`;
  if (typeof given === "string") return given;
  if (typeof given === "object" && "language" in given) return `${(given as { language: string }).language} code`;
  return null;
}
