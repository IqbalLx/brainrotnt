import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";
import type { FlagProblemBody } from "./schema";

// Flagging also takes the problem out of rotation: only "verified" problems are served.
export function flagProblem(body: FlagProblemBody): string | null {
  return db.transaction((tx) => {
    const found = tx.select({ id: problems.id }).from(problems).where(eq(problems.id, body.problemId)).get();
    if (!found) return null;

    const id = crypto.randomUUID();
    tx.insert(flags).values({ id, problemId: body.problemId, reason: body.reason, resolved: false, createdAt: new Date() }).run();
    tx.update(problems).set({ verificationStatus: "flagged" }).where(eq(problems.id, body.problemId)).run();
    return id;
  });
}
