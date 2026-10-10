import { db } from "./db/client";
import { problems } from "./db/schema";

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
