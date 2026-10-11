import { verifyKeyAgainstPoints } from "@brainrotnt/math-engine";
import { statementHash } from "../content/hash";
import { problemSpec, storedAnswer } from "../content/problem-spec";
import { verifyReference } from "../content/verify-reference";
import { getSandboxMode } from "../infra/sandbox-runner";
import { CODE_SEEDS } from "./code-seeds";
import { db } from "./client";
import { mcqAnswer, numericAnswer, symbolicAnswer } from "./answer";
import { problems } from "./schema";

type Subject = "math" | "stats" | "physics";
type Tools = { calculator: "none" | "basic" | "scientific" | "stats"; draw: boolean };

interface Seed {
  id: string;
  subject: Subject;
  topic: string;
  difficulty: number;
  statement: string;
  tools: Tools;
  mcq?: { options: string[]; correct: number };
  numeric?: { value: number; tolerance: number; unit?: string };
  symbolic?: { expression: string; variables: string[]; points?: number[]; reference: (x: number) => number };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sampleSd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const derivative = (f: (x: number) => number) => (x: number) => (f(x + 1e-5) - f(x - 1e-5)) / 2e-5;
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

const SEEDS: Seed[] = [
  {
    id: "math-arith-001",
    subject: "math",
    topic: "arithmetic",
    difficulty: 1,
    statement: "What is 17 × 24?",
    tools: { calculator: "none", draw: false },
    numeric: { value: 17 * 24, tolerance: 0 },
  },
  {
    id: "math-algebra-001",
    subject: "math",
    topic: "algebra",
    difficulty: 2,
    statement: "Solve for x: 3x + 7 = 31.",
    tools: { calculator: "basic", draw: true },
    numeric: { value: (31 - 7) / 3, tolerance: 0 },
  },
  {
    id: "math-calculus-001",
    subject: "math",
    topic: "derivatives",
    difficulty: 2,
    statement: "What is the derivative of x^3 with respect to x?",
    tools: { calculator: "none", draw: true },
    mcq: { options: ["3x", "3x^2", "x^2", "x^4 / 4"], correct: 1 },
  },
  {
    id: "math-probability-001",
    subject: "math",
    topic: "probability",
    difficulty: 2,
    statement: "Two fair six-sided dice are rolled. What is the probability that the sum is 8? Answer as a decimal or a fraction.",
    tools: { calculator: "basic", draw: true },
    numeric: { value: 5 / 36, tolerance: 0.01 },
  },
  {
    id: "math-combinatorics-001",
    subject: "math",
    topic: "permutations",
    difficulty: 3,
    statement: "In how many different orders can 6 people stand in a line?",
    tools: { calculator: "basic", draw: true },
    numeric: { value: factorial(6), tolerance: 0 },
  },
  {
    id: "stats-mean-001",
    subject: "stats",
    topic: "descriptive",
    difficulty: 1,
    statement: "What is the mean of 4, 8, 15, 16, 23 and 42?",
    tools: { calculator: "basic", draw: false },
    numeric: { value: mean([4, 8, 15, 16, 23, 42]), tolerance: 0 },
  },
  {
    id: "stats-sd-001",
    subject: "stats",
    topic: "descriptive",
    difficulty: 3,
    statement: "What is the sample standard deviation of 2, 4, 4, 4, 5, 5, 7, 9? Give 3 decimal places or more.",
    tools: { calculator: "scientific", draw: false },
    numeric: { value: sampleSd([2, 4, 4, 4, 5, 5, 7, 9]), tolerance: 0.005 },
  },
  {
    id: "stats-pvalue-001",
    subject: "stats",
    topic: "hypothesis-testing",
    difficulty: 2,
    statement: "Which statement best describes a p-value?",
    tools: { calculator: "none", draw: false },
    mcq: {
      options: [
        "The probability of seeing data at least as extreme as observed, assuming the null hypothesis is true",
        "The probability that the null hypothesis is true",
        "The probability that the alternative hypothesis is true",
        "The probability of making a Type II error",
      ],
      correct: 0,
    },
  },
  {
    id: "physics-kinematics-001",
    subject: "physics",
    topic: "kinematics",
    difficulty: 2,
    statement: "A car accelerates from rest at 3 m/s² for 8 s. How far does it travel?",
    tools: { calculator: "scientific", draw: true },
    numeric: { value: 0.5 * 3 * 8 ** 2, tolerance: 0.01, unit: "m" },
  },
  {
    id: "physics-energy-001",
    subject: "physics",
    topic: "energy",
    difficulty: 1,
    statement: "A 2 kg object moves at 5 m/s. What is its kinetic energy?",
    tools: { calculator: "basic", draw: false },
    numeric: { value: 0.5 * 2 * 5 ** 2, tolerance: 0.01, unit: "J" },
  },
  {
    id: "physics-vectors-001",
    subject: "physics",
    topic: "vectors",
    difficulty: 1,
    statement: "Which of these quantities is a vector?",
    tools: { calculator: "none", draw: false },
    mcq: { options: ["Speed", "Distance", "Displacement", "Energy"], correct: 2 },
  },
  {
    id: "physics-freefall-001",
    subject: "physics",
    topic: "kinematics",
    difficulty: 3,
    statement: "A ball is dropped from a height of 20 m. Ignoring air resistance and using g = 9.8 m/s², how long does it take to hit the ground?",
    tools: { calculator: "scientific", draw: true },
    numeric: { value: Math.sqrt((2 * 20) / 9.8), tolerance: 0.01, unit: "s" },
  },
  {
    id: "math-calculus-002",
    subject: "math",
    topic: "derivatives",
    difficulty: 2,
    statement: "Differentiate f(x) = x^3 + 2x with respect to x. Answer in terms of x.",
    tools: { calculator: "none", draw: true },
    symbolic: { expression: "3*x^2 + 2", variables: ["x"], reference: derivative((x) => x ** 3 + 2 * x) },
  },
  {
    id: "math-algebra-002",
    subject: "math",
    topic: "algebra",
    difficulty: 2,
    statement: "Expand (x + 3)^2. Answer in terms of x.",
    tools: { calculator: "none", draw: false },
    symbolic: { expression: "x^2 + 6*x + 9", variables: ["x"], reference: (x) => (x + 3) * (x + 3) },
  },
  {
    id: "math-algebra-003",
    subject: "math",
    topic: "algebra",
    difficulty: 2,
    statement: "Simplify (x^2 - 9) / (x - 3), for x not equal to 3. Answer in terms of x.",
    tools: { calculator: "none", draw: false },
    symbolic: { expression: "x + 3", variables: ["x"], points: [0.5, 1, 1.5, 2, 2.5, 4], reference: (x) => (x * x - 9) / (x - 3) },
  },
  {
    id: "math-calculus-003",
    subject: "math",
    topic: "derivatives",
    difficulty: 3,
    statement: "Differentiate f(x) = sin(2x) with respect to x. Answer in terms of x.",
    tools: { calculator: "scientific", draw: true },
    symbolic: { expression: "2*cos(2*x)", variables: ["x"], reference: derivative((x) => Math.sin(2 * x)) },
  },
];

function symbolicAnswerFor(seed: Seed) {
  const { expression, variables, points = [0.5, 1, 1.5, 2, 2.5, 3], reference } = seed.symbolic!;
  // A key is only inserted if it reproduces values computed independently of it.
  const verdict = verifyKeyAgainstPoints(expression, variables, points.map((x) => ({ vars: { x }, value: reference(x) })));
  if (!verdict.ok) throw new Error(`seed ${seed.id}: ${verdict.error}`);
  return symbolicAnswer.parse({ expression, variables });
}

const rows: (typeof problems.$inferInsert)[] = SEEDS.map((seed) => {
  const type: "mcq" | "numeric" | "symbolic" = seed.mcq ? "mcq" : seed.symbolic ? "symbolic" : "numeric";
  const answer = seed.mcq ? mcqAnswer.parse(seed.mcq) : seed.symbolic ? symbolicAnswerFor(seed) : numericAnswer.parse(seed.numeric);
  return {
    id: seed.id,
    version: 1,
    subject: seed.subject,
    topic: seed.topic,
    difficulty: seed.difficulty,
    type,
    statement: seed.statement,
    tools: seed.tools,
    answer,
    verificationStatus: "verified" as const,
    source: null,
    statementHash: statementHash(seed.statement, seed.topic),
    createdAt: new Date(),
  };
});

// Code problems are verified by running their solutions, which needs the sandbox; without it they are skipped.
async function codeRows(): Promise<(typeof problems.$inferInsert)[]> {
  if ((await getSandboxMode()) === "unavailable") {
    console.warn("[seed] the sandbox is unavailable, so the programming problems were skipped (see the README).");
    return [];
  }
  const out: (typeof problems.$inferInsert)[] = [];
  for (const raw of CODE_SEEDS) {
    const spec = problemSpec.parse(raw);
    const verdict = await verifyReference(spec);
    if (!verdict.ok) throw new Error(`seed ${raw.id}: ${verdict.error}`);
    out.push({
      id: raw.id,
      version: 1,
      subject: spec.subject,
      topic: spec.topic,
      difficulty: spec.difficulty,
      type: spec.type,
      statement: spec.statement,
      tools: spec.tools,
      answer: storedAnswer(spec),
      verificationStatus: "verified",
      source: null,
      statementHash: statementHash(spec.statement, spec.topic),
      createdAt: new Date(),
    });
  }
  return out;
}

rows.push(...(await codeRows()));

// Problems are immutable once verified, so existing ids are left untouched.
const inserted = await db.insert(problems).values(rows).onConflictDoNothing().returning({ id: problems.id });
console.log(`Seeded ${inserted.length} new problems (${rows.length - inserted.length} already present).`);
