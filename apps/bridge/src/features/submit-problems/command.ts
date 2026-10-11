import { inArray } from "drizzle-orm";
import { generatedId, statementHash } from "../../content/hash";
import { issuesOf, problemSpec, semanticIssues, type ProblemSpec } from "../../content/problem-spec";
import { verifyAll } from "../../content/verify-reference";
import { db } from "../../db/client";
import { problems } from "../../db/schema";

export const MAX_BATCH = 25;

export type ItemResult = { index: number; status: "inserted"; id: string } | { index: number; status: "rejected"; errors: string[] };

export interface SubmitResult {
  submitted: number;
  inserted: number;
  rejected: number;
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
  rawItems.forEach((raw, index) => {
    const parsed = problemSpec.safeParse(raw);
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
  const accepted: Candidate[] = [];
  fresh.forEach((candidate, i) => {
    const verdict = verdicts[i];
    if (verdict.ok) accepted.push(candidate);
    else reject(candidate.index, [verdict.error]);
  });

  if (accepted.length) {
    const now = new Date();
    db.transaction((tx) => {
      for (const { spec, hash, id } of accepted) {
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
            answer: spec.answer,
            verificationStatus: "verified",
            source: spec.source ?? null,
            statementHash: hash,
            createdAt: now,
          })
          .run();
      }
    });
    for (const { index, id } of accepted) results[index] = { index, status: "inserted", id };
  }

  const inserted = accepted.length;
  return { submitted: rawItems.length, inserted, rejected: rawItems.length - inserted, results };
}

