import { Hono } from "hono";
import { listFlagged } from "./query";

export const listFlaggedRoute = new Hono();

// For the problem bank page. Unlike the MCP tool, the browser never gets answer keys, hints or
// explanations: only what is needed to see what was flagged and ask Claude Code to repair it.
listFlaggedRoute.get("/", async (c) => {
  const flagged = await listFlagged();
  return c.json(
    flagged.map(({ id, subject, topic, difficulty, type, statement, inRotation, flags }) => ({
      id,
      subject,
      topic,
      difficulty,
      type,
      statement,
      inRotation,
      flags,
    })),
  );
});
