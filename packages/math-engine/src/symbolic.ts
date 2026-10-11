import type { MathNode } from "mathjs";
import { checkSyntax, parse, SYMBOLIC_RULES } from "./engine";

// Single lowercase letters, but not e (Euler's number) or i (the imaginary unit).
export const VARIABLE_PATTERN = /^[a-df-hj-z]$/;

export const MAX_EXPRESSION_LENGTH = 200;
const SAMPLE_POINTS = 40;
const MIN_VALID_POINTS = 8;
// A removable singularity, such as (x^2-9)/(x-3) at x=3, makes an equivalent answer undefined at a
// point or two. More than this means it is undefined over a stretch of the domain, which is a real difference.
const ALLOWED_UNDEFINED_POINTS = 2;
const SPECIAL_VALUES = [0, 1, -1, 2, 0.5, -0.5, 3];

export interface SymbolicSpec {
  variables: string[];
  domain: [number, number];
}

export type Compiled = { ok: true; evaluate: (scope: Record<string, number>) => number | null } | { ok: false; error: string };

// Parses an expression, checks it against the answer whitelist, and returns a function that
// evaluates it at a point: a finite real number, or null where it is undefined or not real.
export function compileExpression(expression: string, variables: string[]): Compiled {
  const source = expression.trim();
  if (source === "") return { ok: false, error: "Enter an expression" };
  if (source.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: `Keep it under ${MAX_EXPRESSION_LENGTH} characters` };

  try {
    const node = parse(source) as MathNode;
    const problem = checkSyntax(node, SYMBOLIC_RULES, { variables, context: "answer" });
    if (problem) return { ok: false, error: problem };
    const code = node.compile();
    return {
      ok: true,
      evaluate(scope) {
        try {
          const value: unknown = code.evaluate({ ...scope });
          return typeof value === "number" && Number.isFinite(value) ? value : null;
        } catch {
          return null;
        }
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/ \(char \d+\)$/, "") : "Could not read that";
    return { ok: false, error: message };
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same points every time for the same key, so grading is deterministic.
export function samplePoints(spec: SymbolicSpec, seedText: string): Record<string, number>[] {
  const [low, high] = spec.domain;
  const specials = SPECIAL_VALUES.filter((v) => v >= low && v <= high);
  const random = mulberry32(fnv1a(seedText));
  const points: Record<string, number>[] = [];

  for (let k = 0; k < specials.length; k++) {
    points.push(Object.fromEntries(spec.variables.map((name, j) => [name, specials[(k + j) % specials.length]])));
  }
  while (points.length < SAMPLE_POINTS) {
    points.push(Object.fromEntries(spec.variables.map((name) => [name, low + random() * (high - low)])));
  }
  return points;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

export type EquivalenceResult = { ok: true; equivalent: boolean } | { ok: false; reason: "key" | "given"; error: string };

// Two expressions are treated as equal if they agree at 40 fixed sample points of the domain, wherever
// the key is defined. This is a randomized identity test, not a proof; for the algebra and calculus
// answers this app asks, a mismatch would have to hide at every one of the points.
export function checkEquivalent(key: string, given: string, spec: SymbolicSpec): EquivalenceResult {
  const keyCode = compileExpression(key, spec.variables);
  if (!keyCode.ok) return { ok: false, reason: "key", error: `The answer key is not usable: ${keyCode.error}` };
  const givenCode = compileExpression(given, spec.variables);
  if (!givenCode.ok) return { ok: false, reason: "given", error: givenCode.error };

  let valid = 0;
  let undefinedHits = 0;
  for (const point of samplePoints(spec, key)) {
    const expected = keyCode.evaluate(point);
    if (expected === null) continue;
    valid++;
    const actual = givenCode.evaluate(point);
    if (actual === null) {
      if (++undefinedHits > ALLOWED_UNDEFINED_POINTS) return { ok: true, equivalent: false };
      continue;
    }
    if (!close(expected, actual)) return { ok: true, equivalent: false };
  }
  if (valid < MIN_VALID_POINTS) return { ok: false, reason: "key", error: "The answer key is undefined on most of its domain" };
  return { ok: true, equivalent: true };
}

export interface ReferencePoint {
  vars: Record<string, number>;
  value: number;
}

// Checks a key against values an independent reference solution computed, e.g. by numerical
// differentiation. This is what verifies a symbolic problem's key before it enters the bank.
export function verifyKeyAgainstPoints(key: string, variables: string[], points: ReferencePoint[], tolerance = 1e-5): { ok: true } | { ok: false; error: string } {
  const code = compileExpression(key, variables);
  if (!code.ok) return { ok: false, error: `The answer key is not usable: ${code.error}` };
  for (const point of points) {
    const actual = code.evaluate(point.vars);
    if (actual === null) return { ok: false, error: `the key is undefined at ${JSON.stringify(point.vars)} where the reference solution gave ${point.value}` };
    if (Math.abs(actual - point.value) > tolerance * Math.max(1, Math.abs(point.value)) + 1e-9) {
      return { ok: false, error: `the key gives ${actual} at ${JSON.stringify(point.vars)} but the reference solution computed ${point.value}` };
    }
  }
  return { ok: true };
}
