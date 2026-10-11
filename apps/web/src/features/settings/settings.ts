import { CALCULATOR_TIERS, type CalculatorTier } from "@brainrotnt/math-engine/tiers";

export { CALCULATOR_TIERS, type CalculatorTier };

export const SUBJECT_IDS = ["math", "stats", "physics"] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];


export interface Settings {
  subject: SubjectId;
  minDifficulty: number;
  maxDifficulty: number;
  calculator: CalculatorTier;
}

export const DEFAULT_SETTINGS: Settings = { subject: "math", minDifficulty: 1, maxDifficulty: 5, calculator: "scientific" };

export const STORAGE_KEY = "brainrotnt.settings.v1";

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

export function parseStoredSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const { subject, minDifficulty, maxDifficulty, calculator } = value;
    const validLevel = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
    if (
      SUBJECT_IDS.includes(subject as SubjectId) &&
      validLevel(minDifficulty) &&
      validLevel(maxDifficulty) &&
      minDifficulty <= maxDifficulty &&
      CALCULATOR_TIERS.includes(calculator as CalculatorTier)
    ) {
      return { subject: subject as SubjectId, minDifficulty, maxDifficulty, calculator: calculator as CalculatorTier };
    }
  } catch {
    // fall through to the defaults
  }
  return DEFAULT_SETTINGS;
}
