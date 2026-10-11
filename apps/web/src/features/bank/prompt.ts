import { SUBJECT_LABEL } from "../session/format";

export interface GenerateRequest {
  subject: "math" | "stats" | "physics" | "code" | "trivia";
  topic: string;
  minDifficulty: number;
  maxDifficulty: number;
  count: number;
  extras: boolean;
  directive: string;
}

const NOUN = { math: "math problems", stats: "statistics problems", physics: "physics problems", code: "programming problems", trivia: "trivia questions" };

const difficulty = (min: number, max: number) => (min === max ? `difficulty ${min}` : `difficulty ${min} to ${max}`);

// The app cannot start Claude Code, so it writes the instruction for you to paste into it.
export function generatePrompt(request: GenerateRequest): string {
  const topic = request.topic.trim();
  const what = `${request.count} ${NOUN[request.subject]}`;
  const where = topic ? ` on ${topic}` : `, choosing the thinnest ${SUBJECT_LABEL[request.subject] ?? request.subject} topics from get_coverage`;
  const parts = [`Use the brainrotnt-problems skill and the brainrotnt MCP tools to add ${what}${where}, ${difficulty(request.minDifficulty, request.maxDifficulty)}.`];
  if (request.extras) parts.push("Give each one three hints and an explanation.");
  if (request.subject === "trivia") parts.push("Cite two sources on different sites for every question, from pages you have opened.");
  if (request.subject === "code") parts.push("Offer Python and JavaScript, with a deliberately wrong solution for each.");
  const directive = request.directive.trim();
  if (directive) parts.push(directive.endsWith(".") ? directive : `${directive}.`);
  return parts.join(" ");
}

export function repairPrompt(problem: { id: string; flags: { reason: string }[] }): string {
  const reasons = problem.flags.map((f) => f.reason).filter((r) => r !== "wrong_or_ambiguous");
  const why = reasons.length ? ` It was flagged: ${reasons.map((r) => `"${r}"`).join("; ")}.` : "";
  return `Use the brainrotnt-problems skill to repair brainrotnt problem ${problem.id}: read it with list_flagged, fix what is wrong and submit the full corrected problem with update_problem.${why}`;
}

export function backfillPrompt(missing: number, subject?: string): string {
  const scope = subject ? ` ${SUBJECT_LABEL[subject] ?? subject}` : "";
  return `Use the brainrotnt-problems skill to backfill hints and explanations: list_missing_extras shows ${missing}${scope} problems without them. Work through them 5 at a time with update_problem, re-writing each full problem with three hints and an explanation.`;
}
