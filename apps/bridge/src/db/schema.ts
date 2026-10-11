import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  subject: text("subject", { enum: ["math", "stats", "physics", "code"] }).notNull(),
  topic: text("topic").notNull(),
  difficulty: integer("difficulty").notNull(),
  type: text("type", { enum: ["mcq", "numeric", "symbolic", "code"] }).notNull(),
  statement: text("statement").notNull(),
  tools: text("tools", { mode: "json" }).notNull(),
  answer: text("answer", { mode: "json" }).notNull(),
  verificationStatus: text("verification_status", {
    enum: ["verified", "unverified", "flagged", "retired"],
  })
    .notNull()
    .default("unverified"),
  source: text("source"),
  statementHash: text("statement_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  answerGiven: text("answer_given", { mode: "json" }).notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  secondsSpent: real("seconds_spent").notNull(),
  toolsUsed: text("tools_used", { mode: "json" }).notNull(),
  agentStateAtStart: text("agent_state_at_start", {
    enum: ["idle", "working", "blocked", "done"],
  }).notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  // Null for attempts made outside a session (v1).
  sessionId: text("session_id").references(() => sessions.id),
  hintsUsed: integer("hints_used").notNull().default(0),
});

// A session is a fixed set of questions, chosen when it starts.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  subjects: text("subjects", { mode: "json" }).$type<string[]>().notNull(),
  minDifficulty: integer("min_difficulty").notNull(),
  maxDifficulty: integer("max_difficulty").notNull(),
  size: integer("size").notNull(),
  startedBy: text("started_by", { enum: ["agent", "manual"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  endReason: text("end_reason", { enum: ["completed", "ended_early", "abandoned"] }),
  // Sum of the credit of every question; set when the session ends.
  score: real("score"),
});

export const sessionItems = sqliteTable(
  "session_items",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    position: integer("position").notNull(),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id),
    hintsRevealed: integer("hints_revealed").notNull().default(0),
    outcome: text("outcome", { enum: ["answered", "skipped"] }),
    attemptId: text("attempt_id").references(() => attempts.id),
    credit: real("credit"),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.position] })],
);

export const flags = sqliteTable("flags", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  reason: text("reason").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
