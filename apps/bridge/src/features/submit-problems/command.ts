import { inArray } from "drizzle-orm";
import { expandTemplate } from "../../content/expand-template";
import { generatedId, statementHash } from "../../content/hash";
import { isTemplateItem, issuesOf, parseProblemSpec, semanticIssues, storedAnswer, templateSpec, type ProblemSpec } from "../../content/problem-spec";
import { verifyAll } from "../../content/verify-reference";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";

export const MAX_BATCH = 25;

export type ItemResult =
  | { index: number; status: "inserted"; id: string; ids?: string[]; notes?: string[]; verification?: "unverified" }
  | { index: number; status: "rejected"; errors: string[] };

export interface SubmitResult {
  submitted: number;
  inserted: number;
  rejected: number;
  /** Rows added to the bank: a template item adds one per variant. */
  problemsAdded: number;
  results: ItemResult[];
}

interface Candidate {
  index: number;
  spec: ProblemSpec;
  hash: string;
  id: string;
}

// Each item stands alone: a bad one is rejected with its errors and the rest still go in.
export async function submitProblems(rawItems: unknown[]): Promise<SubmitResult> {
  const results: ItemResult[] = new Array(rawItems.length);
  const reject = (index: number, errors: string[]) => {
    results[index] = { index, status: "rejected", errors };
  };

  const candidates: Candidate[] = [];
  const templateItems: { index: number; raw: unknown }[] = [];
  rawItems.forEach((raw, index) => {
    if (isTemplateItem(raw)) {
      templateItems.push({ index, raw });
      return;
    }
    const parsed = parseProblemSpec(raw);
    if (!parsed.success) return reject(index, issuesOf(parsed.error));
    const issues = semanticIssues(parsed.data);
    if (issues.length) return reject(index, issues);
    const hash = statementHash(parsed.data.statement, parsed.data.topic);
    candidates.push({ index, spec: parsed.data, hash, id: parsed.data.id ?? generatedId(parsed.data.subject, parsed.data.topic, hash) });
  });

  // Duplicates against the bank (retired versions don't count) and against earlier items in this batch.
  const existing = candidates.length
    ? await db
        .select({ id: problems.id, hash: problems.statementHash, status: problems.verificationStatus })
        .from(problems)
        .where(inArray(problems.statementHash, candidates.map((c) => c.hash)))
    : [];
  const idsTaken = candidates.length
    ? new Set((await db.select({ id: problems.id }).from(problems).where(inArray(problems.id, candidates.map((c) => c.id)))).map((r) => r.id))
    : new Set<string>();
  const seenHash = new Map<string, number>();
  const seenId = new Map<string, number>();

  const fresh: Candidate[] = [];
  for (const candidate of candidates) {
    const duplicate = existing.find((row) => row.hash === candidate.hash && row.status !== "retired");
    if (duplicate) {
      reject(candidate.index, [`duplicate: the same statement and topic already exist as ${duplicate.id}`]);
    } else if (seenHash.has(candidate.hash)) {
      reject(candidate.index, [`duplicate: same statement and topic as item ${seenHash.get(candidate.hash)} in this batch`]);
    } else if (idsTaken.has(candidate.id) || seenId.has(candidate.id)) {
      reject(candidate.index, [`id: ${candidate.id} is already taken`]);
    } else {
      seenHash.set(candidate.hash, candidate.index);
      seenId.set(candidate.id, candidate.index);
      fresh.push(candidate);
    }
  }

  const verdicts = await verifyAll(fresh.map((c) => c.spec));
  const accepted: (Candidate & { notes: string[]; status: "verified" | "unverified" })[] = [];
  fresh.forEach((candidate, i) => {
    const verdict = verdicts[i];
    if (verdict.ok) accepted.push({ ...candidate, notes: verdict.notes, status: verdict.status ?? "verified" });
    else reject(candidate.index, [verdict.error]);
  });

  if (accepted.length) {
    const now = new Date();
    db.transaction((tx) => {
      for (const { spec, hash, id, notes, status } of accepted) {
        tx.insert(problems)
          .values({
            id,
            version: 1,
            subject: spec.subject,
            topic: spec.topic,
            difficulty: spec.difficulty,
            type: spec.type,
            statement: spec.statement,
            tools: spec.tools,
            answer: storedAnswer(spec),
            hints: spec.hints ?? null,
            explanation: spec.explanation ?? null,
            sources: spec.subject === "trivia" ? spec.sources : null,
            verificationStatus: status,
            source: spec.source ?? null,
            statementHash: hash,
            createdAt: now,
          })
          .run();
        // Review notes leave the problem in rotation but list it for a person (or agent) to look at.
        for (const reason of notes) {
          tx.insert(flags).values({ id: crypto.randomUUID(), problemId: id, reason, resolved: false, createdAt: now }).run();
        }
      }
    });
    for (const { index, id, notes, status } of accepted) {
      results[index] = { index, status: "inserted", id, ...(status === "unverified" ? { verification: "unverified" as const } : {}), ...(notes.length ? { notes } : {}) };
    }
  }

  let problemsAdded = accepted.length;
  for (const { index, raw } of templateItems) {
    const outcome = await submitTemplate(raw);
    if (outcome.ok) {
      results[index] = { index, status: "inserted", id: outcome.baseId, ids: outcome.ids };
      problemsAdded += outcome.ids.length;
    } else {
      reject(index, outcome.errors);
    }
  }

  const inserted = results.filter((r) => r.status === "inserted").length;
  return { submitted: rawItems.length, inserted, rejected: rawItems.length - inserted, problemsAdded, results };
}

// A template is one generator expanded into a family of verified variants: all of them go in, or none do.
async function submitTemplate(raw: unknown): Promise<{ ok: true; baseId: string; ids: string[] } | { ok: false; errors: string[] }> {
  const parsed = templateSpec.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) };
  const spec = parsed.data;

  const expanded = await expandTemplate(spec);
  if (!expanded.ok) return expanded;

  const baseId = spec.id ?? generatedId(spec.subject, spec.topic, statementHash(spec.template.statement, spec.topic));
  const ids = expanded.variants.map((v) => `${baseId}.s${v.seed}`);

  const takenIds = await db.select({ id: problems.id }).from(problems).where(inArray(problems.id, ids));
  if (takenIds.length) return { ok: false, errors: [`id: ${takenIds[0].id} is already taken (this template was already submitted?)`] };

  const clashes = await db
    .select({ id: problems.id, status: problems.verificationStatus })
    .from(problems)
    .where(inArray(problems.statementHash, expanded.variants.map((v) => v.hash)));
  const live = clashes.find((row) => row.status !== "retired");
  if (live) return { ok: false, errors: [`duplicate: a variant has the same statement and topic as ${live.id}`] };

  const now = new Date();
  db.transaction((tx) => {
    expanded.variants.forEach((variant, i) => {
      tx.insert(problems)
        .values({
          id: ids[i],
          version: 1,
          subject: spec.subject,
          topic: spec.topic,
          difficulty: spec.difficulty,
          type: spec.type,
          statement: variant.statement,
          tools: spec.tools,
          answer: variant.answer,
          hints: variant.hints ?? null,
          explanation: variant.explanation ?? null,
          verificationStatus: "verified",
          source: spec.source ?? null,
          statementHash: variant.hash,
          createdAt: now,
        })
        .run();
    });
  });
  return { ok: true, baseId, ids };
}

