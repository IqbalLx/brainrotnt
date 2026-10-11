import { db } from "./db/client";
import { attempts, flags, problems, sessionItems, sessions } from "./db/schema";

let counter = 0;

export async function insertProblem(overrides: Partial<typeof problems.$inferInsert> = {}) {
  counter += 1;
  const id = overrides.id ?? `test-problem-${counter}`;
  await db.insert(problems).values({
    id,
    version: 1,
    subject: "math",
    topic: "arithmetic",
    difficulty: 1,
    type: "numeric",
    statement: `Test statement ${id}`,
    tools: { calculator: "none", draw: false },
    answer: { value: 42, tolerance: 0 },
    verificationStatus: "verified",
    source: null,
    statementHash: `hash-${id}`,
    createdAt: new Date(),
    ...overrides,
  });
  return id;
}

export const postJson = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const json = async (res: Response) => (await res.json()) as Record<string, any>;

// Test files share one temp database, so every test starts from empty tables.
export async function resetDb() {
  await db.delete(sessionItems);
  await db.delete(attempts);
  await db.delete(sessions);
  await db.delete(flags);
  await db.delete(problems);
}

let specCounter = 0;
const unique = () => `${++specCounter}`.padStart(3, "0");

export function numericSpec(overrides: Record<string, unknown> = {}) {
  return {
    subject: "math",
    topic: "arithmetic",
    difficulty: 1,
    type: "numeric",
    statement: `What is 6 times 7, in test case ${unique()}?`,
    tools: { calculator: "basic", draw: false },
    answer: { value: 42, tolerance: 0 },
    reference: { code: "print(6 * 7)" },
    ...overrides,
  };
}

export function mcqSpec(overrides: Record<string, unknown> = {}) {
  return {
    subject: "physics",
    topic: "vectors",
    difficulty: 1,
    type: "mcq",
    statement: `Which of these quantities is a vector, in test case ${unique()}?`,
    answer: { options: ["Speed", "Mass", "Velocity", "Energy"], correct: 2 },
    reference: { code: "print(['Speed', 'Mass', 'Velocity', 'Energy'].index('Velocity'))" },
    ...overrides,
  };
}

export function symbolicSpec(overrides: Record<string, unknown> = {}) {
  return {
    subject: "math",
    topic: "derivatives",
    difficulty: 2,
    type: "symbolic",
    statement: `Differentiate f(x) = x^3 + 2x with respect to x, in test case ${unique()}.`,
    tools: { calculator: "none", draw: false },
    answer: { expression: "3*x^2 + 2", variables: ["x"] },
    reference: {
      code: [
        "import json",
        "f = lambda x: x**3 + 2*x",
        "h = 1e-5",
        'print(json.dumps({"points": [{"vars": {"x": x}, "value": (f(x + h) - f(x - h)) / (2 * h)} for x in [0.5, 1, 1.5, 2, 2.5, 3]]}))',
      ].join("\n"),
    },
    ...overrides,
  };
}

// "Sum of the even numbers in a list", offered in both languages.
export function codeSpec(overrides: Record<string, unknown> = {}) {
  return {
    subject: "code",
    topic: "loops",
    difficulty: 1,
    type: "code",
    statement: `Write solve(numbers) that returns the sum of the even numbers in a list of integers, in test case ${unique()}.`,
    tools: { calculator: "none", draw: false },
    answer: {
      entry: "solve",
      tests: [
        { args: [[1, 2, 3, 4]], expected: 6 },
        { args: [[]], expected: 0 },
        { args: [[7, 9]], expected: 0, hidden: true },
        { args: [[-2, 5, 10]], expected: 8, hidden: true },
        { args: [[0, 0, 4]], expected: 4, hidden: true },
      ],
    },
    languages: {
      python: {
        starter: "def solve(numbers):\n    # TODO\n    return None\n",
        reference: "def solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0)\n",
        wrong: "def solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0 and n > 0)\n",
      },
      javascript: {
        starter: "function solve(numbers) {\n  // TODO\n}\n",
        reference: "function solve(numbers) {\n  return numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0);\n}\n",
        wrong: "function solve(numbers) {\n  return numbers.filter((n) => n % 2 === 0 && n > 0).reduce((a, b) => a + b, 0);\n}\n",
      },
    },
    ...overrides,
  };
}

// A placeholder fact for tests only; the sources are illustrative, not citations.
export function triviaSpec(overrides: Record<string, unknown> = {}) {
  return {
    subject: "trivia",
    topic: "history",
    difficulty: 1,
    type: "numeric",
    statement: `In which year did the event in test case ${unique()} happen?`,
    answer: { value: 1989 },
    sources: [
      { url: "https://archive.example.org/event", quote: "The event happened in 1989, as recorded here." },
      { url: "https://www.encyclopedia.example.com/event", quote: "In 1989 the event took place." },
    ],
    ...overrides,
  };
}
