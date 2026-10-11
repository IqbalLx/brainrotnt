import { db } from "./db/client";
import { attempts, flags, problems } from "./db/schema";

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
  await db.delete(attempts);
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
