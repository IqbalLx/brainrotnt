import { z } from "zod";
import { grade } from "../grading/grade";
import type { KeyedProblem } from "./hints";

export const explanationSpec = z
  .string()
  .trim()
  .min(20)
  .max(8000)
  .optional()
  .describe(
    "Shown only on the score screen, after the session. Markdown; maths as KaTeX: $...$ inline, and $$ on lines of their own around display maths. Raw HTML is not rendered. " +
      "STEM: a worked solution. Trivia: short context, plus why each wrong option is wrong. " +
      "Except for code problems it must END with a line 'Answer: <value>' in plain calculator syntax (no LaTeX): " +
      "a number (with its unit if any), the correct option's text or letter, or the expression. The server checks it against the key.",
  );

const ANSWER_LINE = /^\**answer\**\s*[:：]\s*\**\s*(.+?)\s*\**\s*$/i;

// "$3x^2 + 2$." or "**408 m**" -> the bare value.
function bare(text: string): string {
  return text
    .replace(/\$/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(/[.。]\s*$/, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .trim();
}

function optionIndex(text: string, options: string[]): number | null {
  const letter = /^\(?([A-Ha-h])[).:]?$/.exec(text);
  if (letter) {
    const index = letter[1].toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : null;
  }
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const index = options.findIndex((option) => option.toLowerCase().replace(/\s+/g, " ") === normalized);
  return index === -1 ? null : index;
}

/** The final Answer line must agree with the key, so the explanation cannot teach a different answer. */
export function explanationIssues(problem: KeyedProblem, explanation: string): string[] {
  if (problem.type === "code") return [];
  const lines = explanation.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  const match = ANSWER_LINE.exec(lines[lines.length - 1] ?? "");
  if (!match) return ["explanation: must end with a line 'Answer: <value>'"];
  const given = bare(match[1]);

  if (problem.type === "mcq") {
    const index = optionIndex(given, problem.answer.options);
    if (index === null) return [`explanation: the Answer line (${given}) is not one of the options or their letters`];
    return index === problem.answer.correct ? [] : [`explanation: the Answer line picks option ${index} but the key is ${problem.answer.correct}`];
  }

  const result = grade(problem.type, problem.answer, given);
  if (result.status === "invalid") return [`explanation: the Answer line (${given}) cannot be read: ${result.message}`];
  if (result.status === "graded" && !result.correct) return [`explanation: the Answer line (${given}) does not match the key (${result.expected})`];
  return [];
}
