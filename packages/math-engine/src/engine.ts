import { all, create, type MathNode } from "mathjs";
import { type CalculatorTier } from "./tiers";

/*
 * A problem's calculator tier is enforced here, not hidden in the UI. Two layers:
 *  1. the mathjs instance has its escape hatches (import, evaluate, parse, ...) replaced with throws,
 *     and its unbounded combinatorics replaced with capped versions;
 *  2. every expression is parsed and its syntax tree is checked against the tier's whitelist
 *     before anything is evaluated.
 */

const MAX_EXPRESSION_LENGTH = 200;

const math = create(all);
export const parse = math.parse;
const format = math.format;
const originalFactorial = math.factorial;
const originalCombinations = math.combinations;
const originalPermutations = math.permutations;

function disabled(name: string) {
  return () => {
    throw new Error(`${name} is disabled`);
  };
}

function assertWhole(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`Arguments must be whole numbers from 0 to ${max}`);
  }
  return value;
}

math.import(
  {
    import: disabled("import"),
    createUnit: disabled("createUnit"),
    reviver: disabled("reviver"),
    evaluate: disabled("evaluate"),
    parse: disabled("parse"),
    compile: disabled("compile"),
    simplify: disabled("simplify"),
    simplifyCore: disabled("simplifyCore"),
    simplifyConstant: disabled("simplifyConstant"),
    derivative: disabled("derivative"),
    resolve: disabled("resolve"),
    rationalize: disabled("rationalize"),
    parser: disabled("parser"),
    factorial: (n: unknown) => originalFactorial(assertWhole(n, 170)),
    combinations: (n: unknown, k: unknown) => {
      const total = assertWhole(n, 1000);
      return originalCombinations(total, Math.min(assertWhole(k, 1000), total));
    },
    permutations: (n: unknown, k?: unknown) => {
      const total = assertWhole(n, 1000);
      return k === undefined ? originalPermutations(total) : originalPermutations(total, Math.min(assertWhole(k, 1000), total));
    },
  },
  { override: true },
);

// Exported so the tests can show layer 1 holds even if a syntax tree slipped past layer 2.
export const restrictedMath = math;


export interface TierRules {
  operators: string[];
  functions: string[];
  constants: string[];
}

const BASIC: TierRules = {
  // "50%" parses to a division by 100; a binary "5 % 2" is "mod" and stays blocked.
  operators: ["add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus"],
  functions: ["sqrt"],
  constants: [],
};

const SCIENTIFIC: TierRules = {
  operators: [...BASIC.operators, "factorial"],
  functions: [...BASIC.functions, "sin", "cos", "tan", "asin", "acos", "atan", "log", "log10", "exp"],
  constants: ["pi", "e"],
};

const STATS: TierRules = {
  operators: SCIENTIFIC.operators,
  functions: [...SCIENTIFIC.functions, "mean", "std", "combinations", "permutations"],
  constants: SCIENTIFIC.constants,
};

// What a symbolic answer may contain: arithmetic, powers, the usual functions and constants, and the
// problem's own variables. No factorial or statistics.
export const SYMBOLIC_RULES: TierRules = {
  operators: BASIC.operators,
  functions: [...SCIENTIFIC.functions, "abs"],
  constants: SCIENTIFIC.constants,
};

const RULES: Record<Exclude<CalculatorTier, "none">, TierRules> = { basic: BASIC, scientific: SCIENTIFIC, stats: STATS };

export function minimumTierFor(kind: "function" | "constant" | "operator", name: string): CalculatorTier {
  for (const tier of ["basic", "scientific", "stats"] as const) {
    const rules = RULES[tier];
    const list = kind === "function" ? rules.functions : kind === "constant" ? rules.constants : rules.operators;
    if (list.includes(name)) return tier;
  }
  return "stats";
}

export type CalcResult = { ok: true; text: string } | { ok: false; error: string };

interface NodeLike {
  type: string;
  fn?: unknown;
  name?: string;
  value?: unknown;
}

interface SyntaxOptions {
  /** Names the expression may use besides the rules' constants, e.g. a problem's variables. */
  variables?: readonly string[];
  /** Wording for refusals: a calculator tier, or a student's answer. */
  context?: "tier" | "answer";
}

export function checkSyntax(node: MathNode, rules: TierRules, options: SyntaxOptions = {}): string | null {
  const variables = options.variables ?? [];
  const where = options.context === "answer" ? "" : " at this tier";
  let problem: string | null = null;

  node.traverse((visited, path, visitedParent) => {
    if (problem) return;
    const n = visited as unknown as NodeLike;
    const parent = visitedParent as unknown as NodeLike | null;
    switch (n.type) {
      case "ConstantNode":
        if (typeof n.value !== "number") problem = "Only numbers are allowed";
        return;
      case "ParenthesisNode":
        return;
      case "OperatorNode":
        if (typeof n.fn !== "string" || !rules.operators.includes(n.fn)) problem = `That operator is not available${where}`;
        return;
      case "FunctionNode": {
        const fn = n.fn as NodeLike;
        if (fn?.type !== "SymbolNode" || !fn.name || !rules.functions.includes(fn.name)) {
          problem = `${fn?.name ?? "That function"} is not available${where}`;
        }
        return;
      }
      case "SymbolNode":
        // A function's own name was already checked at its FunctionNode.
        if (parent?.type === "FunctionNode" && path === "fn") return;
        if (n.name && (rules.constants.includes(n.name) || variables.includes(n.name))) return;
        problem =
          options.context === "answer" && variables.length > 0
            ? `${n.name ?? "That name"} is not a variable here; use ${variables.join(", ")}`
            : `${n.name ?? "That name"} is not available${where}`;
        return;
      default:
        problem = "That syntax is not available";
    }
  });

  return problem;
}

export function calculate(expression: string, tier: CalculatorTier): CalcResult {
  if (tier === "none") return { ok: false, error: "The calculator is not available for this problem" };

  const source = expression.trim();
  if (source === "") return { ok: false, error: "Enter an expression" };
  if (source.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: `Keep it under ${MAX_EXPRESSION_LENGTH} characters` };

  try {
    const node = parse(source) as MathNode;
    const problem = checkSyntax(node, RULES[tier]);
    if (problem) return { ok: false, error: problem };

    const result: unknown = node.evaluate();
    if (typeof result !== "number") return { ok: false, error: "The result is not a real number" };
    if (!Number.isFinite(result)) return { ok: false, error: "Undefined" };
    return { ok: true, text: format(result, { precision: 12 }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not evaluate that" };
  }
}
