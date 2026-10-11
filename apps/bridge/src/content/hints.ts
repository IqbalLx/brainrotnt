import { z } from "zod";
import type { CodeAnswer } from "../db/answer";
import type { Language } from "../infra/sandbox-runner";
import type { ProblemSpec } from "./problem-spec";
import { runTests } from "./run-tests";

export const MAX_HINTS = 3;

export const hintsSpec = z
  .array(z.string().trim().min(5).max(600))
  .min(1)
  .max(MAX_HINTS)
  .optional()
  .describe(
    "Up to 3 hints, revealed one at a time, each closer to the answer without stating it. " +
      "STEM: 1 nudges the concept, 2 names the method and its setup, 3 gives the exact formula or approach. " +
      "Trivia: 1 era or region, 2 a decade, country or small set, 3 a near-giveaway (rule out options, a first letter). " +
      "A hint that contains the answer is rejected. Each hint opened costs the student a quarter of the credit.",
  );

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const compact = (text: string) => text.toLowerCase().replace(/[\s*]/g, "");
const NUMBER = /[-−]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?/gi;

function containsValue(hint: string, value: number, tolerance: number): string | null {
  for (const match of hint.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(NUMBER)) {
    const n = Number(match[0].replace("−", "-"));
    if (!Number.isFinite(n)) continue;
    const allowed = Math.max(value === 0 ? tolerance : tolerance * Math.abs(value), 1e-9 * Math.max(1, Math.abs(value)));
    if (Math.abs(n - value) <= allowed) return match[0];
  }
  return null;
}

function containsOption(hint: string, option: string): boolean {
  const target = normalize(option);
  if (target.length >= 3) return normalize(hint).includes(target);
  // A short option such as "4" only counts as a whole word.
  return new RegExp(`(^|[^a-z0-9])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(normalize(hint));
}

const FENCE = /```[a-zA-Z]*\n([\s\S]*?)```/g;

export type KeyedProblem =
  | { type: "numeric"; answer: { value: number; tolerance: number } }
  | { type: "mcq"; answer: { options: string[]; correct: number } }
  | { type: "symbolic"; answer: { expression: string; variables?: string[] } }
  | { type: "code"; answer: Pick<CodeAnswer, "entry" | "tests">; references: Partial<Record<Language, string>> };

// Rejects any hint that gives the answer away. For code, a hint whose code passes every test is a solution.
export async function hintLeaks(problem: KeyedProblem, hints: string[]): Promise<string[]> {
  const issues: string[] = [];
  for (const [index, hint] of hints.entries()) {
    const where = `hints.${index}`;
    switch (problem.type) {
      case "numeric": {
        const found = containsValue(hint, problem.answer.value, problem.answer.tolerance);
        if (found !== null) issues.push(`${where}: contains the answer (${found}); a hint must not state it`);
        break;
      }
      case "mcq": {
        if (containsOption(hint, problem.answer.options[problem.answer.correct])) {
          issues.push(`${where}: names the correct option; rule out wrong ones instead`);
        }
        break;
      }
      case "symbolic": {
        if (compact(hint).includes(compact(problem.answer.expression))) issues.push(`${where}: contains the answer expression`);
        break;
      }
      case "code": {
        const blocks = [...hint.matchAll(FENCE)].map((m) => m[1]).slice(0, 3);
        for (const block of blocks) {
          for (const language of Object.keys(problem.references) as Language[]) {
            const report = await runTests(language, block, problem.answer);
            if (report.status === "ran" && report.firstFailure === null) {
              issues.push(`${where}: its code is a complete ${language} solution (it passes every test)`);
            }
          }
        }
        break;
      }
    }
  }
  return issues;
}

const TOKEN = /[A-Za-z_]\w*|\d+|[^\s\w]/g;

function overlap(hint: string, reference: string): number {
  const counts = new Map<string, number>();
  for (const token of hint.match(TOKEN) ?? []) counts.set(token, (counts.get(token) ?? 0) + 1);
  const reference_ = reference.match(TOKEN) ?? [];
  if (reference_.length === 0) return 0;
  let shared = 0;
  for (const token of reference_) {
    const left = counts.get(token) ?? 0;
    if (left > 0) {
      shared++;
      counts.set(token, left - 1);
    }
  }
  return shared / reference_.length;
}

export const OVERLAP_THRESHOLD = 0.6;

/** Reasons to have a person look at the last hint of a code problem; the problem still goes in. */
export function hintReviewNotes(problem: KeyedProblem, hints: string[]): string[] {
  if (problem.type !== "code" || hints.length < MAX_HINTS) return [];
  const last = hints[MAX_HINTS - 1];
  return Object.entries(problem.references)
    .filter(([, reference]) => reference && overlap(last, reference) >= OVERLAP_THRESHOLD)
    .map(([language]) => `review: hint 3 shares most of its code with the ${language} reference solution and may give it away`);
}

export function keyedProblem(spec: ProblemSpec): KeyedProblem {
  if (spec.type !== "code") return spec as KeyedProblem;
  const references = Object.fromEntries(Object.entries(spec.languages).flatMap(([language, offered]) => (offered ? [[language, offered.reference]] : [])));
  return { type: "code", answer: spec.answer, references };
}
