import { CODE_LANGUAGES, codeAnswer, mcqAnswer, numericAnswer, symbolicAnswer, type CodeAnswer } from "../db/answer";
import type { problems } from "../db/schema";
import { disclosedTests } from "./disclosure";

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
  /** The tests the difficulty discloses, which can be run before submitting. The rest, and every
   * reference solution, stay on the server. */
  examples: { args: unknown[]; expected: unknown }[];
  /** How many more tests run only on submit. */
  moreTests: number;
}

function codeView(stored: unknown, difficulty: number): CodeView {
  const answer: CodeAnswer = codeAnswer.parse(stored);
  const shown = disclosedTests(answer.tests, difficulty);
  const examples = answer.tests.filter((_, index) => shown[index]).map(({ args, expected }) => ({ args, expected }));
  return {
    entry: answer.entry,
    languages: CODE_LANGUAGES.flatMap((language) => {
      const offered = answer.languages[language];
      return offered ? [{ language, starter: offered.starter }] : [];
    }),
    examples,
    moreTests: answer.tests.length - examples.length,
  };
}

type ProblemRow = Pick<typeof problems.$inferSelect, "id" | "subject" | "topic" | "difficulty" | "type" | "statement" | "tools" | "answer">;

// The answer key stays on the server; only what the UI needs to render is exposed.
export function toProblemView(row: ProblemRow): ProblemView {
  const { answer, ...rest } = row;
  return {
    ...rest,
    choices: row.type === "mcq" ? mcqAnswer.parse(answer).options : null,
    unit: row.type === "numeric" ? (numericAnswer.parse(answer).unit ?? null) : null,
    variables: row.type === "symbolic" ? symbolicAnswer.parse(answer).variables : null,
    code: row.type === "code" ? codeView(answer, row.difficulty) : null,
  };
}
