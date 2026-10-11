import type { CodeView } from "../code-editor/languages";

export interface Problem {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  type: "mcq" | "numeric" | "symbolic" | "code";
  statement: string;
  choices: string[] | null;
  unit: string | null;
  variables: string[] | null;
  code: CodeView | null;
  tools: { calculator: "none" | "basic" | "scientific" | "stats"; draw: boolean };
}

export interface AttemptResult {
  correct: boolean;
  expected: string;
  /** A sentence about how the answer fared, such as which test failed. Only code problems have one. */
  detail: string | null;
}

// Where the question on screen stands.
export type Phase = "answering" | "submitting" | "result";
