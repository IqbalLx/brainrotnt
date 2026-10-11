import { and, between, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { CODE_LANGUAGES, codeAnswer, mcqAnswer, numericAnswer, symbolicAnswer, type CodeAnswer } from "../../db/answer";
import { problems } from "../../db/schema";
import type { GetNextProblemQuery } from "./schema";

export interface ProblemView {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  type: string;
  statement: string;
  tools: unknown;
  choices: string[] | null;
  unit: string | null;
  variables: string[] | null;
  code: CodeView | null;
}

export interface CodeView {
  entry: string;
  languages: { language: (typeof CODE_LANGUAGES)[number]; starter: string }[];
  /** The visible tests only. Hidden ones, and every reference solution, stay on the server. */
  examples: { args: unknown[]; expected: unknown }[];
}

function codeView(stored: unknown): CodeView {
  const answer: CodeAnswer = codeAnswer.parse(stored);
  return {
    entry: answer.entry,
    languages: CODE_LANGUAGES.flatMap((language) => {
      const offered = answer.languages[language];
      return offered ? [{ language, starter: offered.starter }] : [];
    }),
    examples: answer.tests.filter((t) => !t.hidden).map(({ args, expected }) => ({ args, expected })),
  };
}

export async function getNextProblem(filters: GetNextProblemQuery): Promise<ProblemView | null> {
  const rows = await db
    .select({
      id: problems.id,
      subject: problems.subject,
      topic: problems.topic,
      difficulty: problems.difficulty,
      type: problems.type,
      statement: problems.statement,
      tools: problems.tools,
      answer: problems.answer,
    })
    .from(problems)
    .where(
      and(
        eq(problems.subject, filters.subject),
        eq(problems.verificationStatus, "verified"),
        between(problems.difficulty, filters.minDifficulty, filters.maxDifficulty),
        filters.exclude.length > 0 ? notInArray(problems.id, filters.exclude) : undefined,
      ),
    )
    .orderBy(sql`random()`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // The answer key stays on the server; only what the UI needs to render is exposed.
  const { answer, ...rest } = row;
  return {
    ...rest,
    choices: row.type === "mcq" ? mcqAnswer.parse(answer).options : null,
    unit: row.type === "numeric" ? (numericAnswer.parse(answer).unit ?? null) : null,
    variables: row.type === "symbolic" ? symbolicAnswer.parse(answer).variables : null,
    code: row.type === "code" ? codeView(answer) : null,
  };
}
