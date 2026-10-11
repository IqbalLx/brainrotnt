import { CALCULATOR_TIERS, type CalculatorTier } from "@brainrotnt/math-engine/tiers";

export { CALCULATOR_TIERS, type CalculatorTier };

export const SUBJECT_IDS = ["math", "stats", "physics", "code", "trivia"] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];


export const SESSION_SIZES = [3, 5, 10, 15, 20] as const;

export interface Settings {
  /** Every subject a session draws from; never empty. */
  subjects: SubjectId[];
  minDifficulty: number;
  maxDifficulty: number;
  calculator: CalculatorTier;
  sessionSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  subjects: ["math", "stats", "physics", "code"],
  minDifficulty: 1,
  maxDifficulty: 5,
  calculator: "scientific",
  sessionSize: 5,
};

export const STORAGE_KEY = "brainrotnt.settings.v2";
/** v1 stored one subject; it is read once so an upgrade keeps the person's choices. */
export const LEGACY_STORAGE_KEY = "brainrotnt.settings.v1";

// Toggling the last selected subject off would leave nothing to practise, so it stays on.
export function toggleSubject(subjects: SubjectId[], subject: SubjectId): SubjectId[] {
  if (!subjects.includes(subject)) return SUBJECT_IDS.filter((id) => id === subject || subjects.includes(id));
  return subjects.length === 1 ? subjects : subjects.filter((id) => id !== subject);
}

// Outside the range extends it, an end dot shrinks it by one level, and an inner dot moves the
// nearer bound (a tie moves the lower one). A single-level range stays put when clicked.
export function setDifficultyBound(range: { min: number; max: number }, level: number): { min: number; max: number } {
  if (level < range.min) return { min: level, max: range.max };
  if (level > range.max) return { min: range.min, max: level };
  if (range.min === range.max) return range;
  if (level === range.min) return { min: range.min + 1, max: range.max };
  if (level === range.max) return { min: range.min, max: range.max - 1 };
  return level - range.min <= range.max - level ? { min: level, max: range.max } : { min: range.min, max: level };
}

// A problem declares a tier; the person's setting caps it.
export function effectiveTier(problemTier: CalculatorTier, ceiling: CalculatorTier): CalculatorTier {
  return CALCULATOR_TIERS.indexOf(problemTier) <= CALCULATOR_TIERS.indexOf(ceiling) ? problemTier : ceiling;
}

export function parseStoredSettings(raw: string | null, legacy: string | null = null): Settings {
  const value = readJson(raw) ?? upgradeLegacy(readJson(legacy));
  if (!value) return DEFAULT_SETTINGS;
  const { subjects, minDifficulty, maxDifficulty, calculator, sessionSize } = value;
  const validLevel = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  if (
    Array.isArray(subjects) &&
    subjects.length > 0 &&
    subjects.every((s) => SUBJECT_IDS.includes(s as SubjectId)) &&
    validLevel(minDifficulty) &&
    validLevel(maxDifficulty) &&
    minDifficulty <= maxDifficulty &&
    CALCULATOR_TIERS.includes(calculator as CalculatorTier)
  ) {
    return {
      subjects: SUBJECT_IDS.filter((id) => subjects.includes(id)),
      minDifficulty,
      maxDifficulty,
      calculator: calculator as CalculatorTier,
      sessionSize: SESSION_SIZES.includes(sessionSize as never) ? (sessionSize as number) : DEFAULT_SETTINGS.sessionSize,
    };
  }
  return DEFAULT_SETTINGS;
}

function readJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

function upgradeLegacy(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value || typeof value.subject !== "string") return null;
  const { subject, ...rest } = value;
  return { ...rest, subjects: [subject] };
}
