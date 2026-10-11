import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
});

export const flags = sqliteTable("flags", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  reason: text("reason").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
