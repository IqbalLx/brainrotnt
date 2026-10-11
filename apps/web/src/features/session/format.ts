// 3.75, 1 and 0.5 rather than 3.750000001 or 1.00.
export function formatPoints(points: number): string {
  return String(Math.round(points * 100) / 100);
}

export const SUBJECT_LABEL: Record<string, string> = { math: "Math", stats: "Stats", physics: "Physics", code: "Code" };

export const END_REASON_LABEL = { completed: "Completed", ended_early: "Ended early", abandoned: "Abandoned" } as const;
