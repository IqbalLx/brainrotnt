import { useEffect, useState } from "react";
import type { SessionScore } from "../session/useSession";

export interface SessionSummaryRow {
  id: string;
  subjects: string[];
  size: number;
  startedBy: "agent" | "manual";
  startedAt: string;
  endedAt: string;
  endReason: SessionScore["endReason"];
  score: number;
}

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; sessions: SessionSummaryRow[]; score: SessionScore };

// Loads the ended sessions and the score of the one asked for (the latest when none is).
// `refresh` changes when a session ends, so a just-finished session shows up.
export function useReview(sessionId: string | null, refresh: unknown): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const listRes = await fetch("/api/sessions?limit=30");
      if (!listRes.ok) throw new Error(`bridge returned ${listRes.status}`);
      const sessions = (await listRes.json()) as SessionSummaryRow[];
      const id = sessionId ?? sessions[0]?.id;
      if (!id) return !cancelled && setState({ status: "empty" });
      const scoreRes = await fetch(`/api/sessions/${id}/score`);
      if (!scoreRes.ok) throw new Error(scoreRes.status === 404 ? "That session does not exist." : `bridge returned ${scoreRes.status}`);
      const score = (await scoreRes.json()) as SessionScore;
      if (!cancelled) setState({ status: "ready", sessions, score });
    })().catch((e) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : "failed to load" }));
    return () => {
      cancelled = true;
    };
  }, [sessionId, refresh]);

  return state;
}
