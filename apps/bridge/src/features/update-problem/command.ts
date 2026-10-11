import { and, eq, ne } from "drizzle-orm";
import { statementHash } from "../../content/hash";
import { issuesOf, parseProblemSpec, semanticIssues, storedAnswer } from "../../content/problem-spec";
import { verifyReference } from "../../content/verify-reference";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";

export type UpdateResult = { ok: true; id: string; version: number; retired: string; notes?: string[] } | { ok: false; errors: string[] };

// A verified problem is immutable. A repair inserts the next version and retires the old one, so
// earlier attempts keep pointing at exactly what the person answered.
export async function updateProblem(id: string, raw: unknown): Promise<UpdateResult> {
  const [existing] = await db.select().from(problems).where(eq(problems.id, id));
  if (!existing) return { ok: false, errors: [`problem ${id} not found`] };
  if (existing.verificationStatus === "retired") {
    return { ok: false, errors: [`problem ${id} was already replaced by a newer version; update that one instead`] };
  }

  const parsed = parseProblemSpec(raw);
  if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) };
  const spec = parsed.data;
  const issues = semanticIssues(spec);
  if (issues.length) return { ok: false, errors: issues };

  const version = existing.version + 1;
  const baseId = id.replace(/\.v\d+$/, "");
  const newId = `${baseId}.v${version}`;
  const hash = statementHash(spec.statement, spec.topic);

  const [clash] = await db
    .select({ id: problems.id })
    .from(problems)
    .where(and(eq(problems.statementHash, hash), ne(problems.id, id), ne(problems.verificationStatus, "retired")));
  if (clash) return { ok: false, errors: [`duplicate: the same statement and topic already exist as ${clash.id}`] };
  const [taken] = await db.select({ id: problems.id }).from(problems).where(eq(problems.id, newId));
  if (taken) return { ok: false, errors: [`${newId} already exists`] };

  const verdict = await verifyReference(spec);
  if (!verdict.ok) return { ok: false, errors: [verdict.error] };

  db.transaction((tx) => {
    tx.insert(problems)
      .values({
        id: newId,
        version,
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
        verificationStatus: verdict.status ?? "verified",
        source: spec.source ?? existing.source,
        statementHash: hash,
        createdAt: new Date(),
      })
      .run();
    tx.update(problems).set({ verificationStatus: "retired" }).where(eq(problems.id, id)).run();
    tx.update(flags).set({ resolved: true }).where(eq(flags.problemId, id)).run();
    for (const reason of verdict.notes) {
      tx.insert(flags).values({ id: crypto.randomUUID(), problemId: newId, reason, resolved: false, createdAt: new Date() }).run();
    }
  });

  return { ok: true, id: newId, version, retired: id, ...(verdict.notes.length ? { notes: verdict.notes } : {}) };
}

