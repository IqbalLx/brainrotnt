import { useEffect, useState } from "react";
import type { AgentState } from "../agent-state/useAgentState";

export interface SessionSummaryData {
  attempts: number;
  correct: number;
  accuracyPercent: number | null;
  bySubject: { subject: string; attempts: number; correct: number }[];
}

// Offered once per run, when the agent reaches Done and the person practiced during it.
export function useSessionSummary(status: AgentState, runId: number, startedAt: number | null) {
  const [offer, setOffer] = useState<{ runId: number; data: SessionSummaryData } | null>(null);

  useEffect(() => {
    if (status !== "done" || startedAt === null) return;

    const controller = new AbortController();
    const since = new Date(startedAt).toISOString();
    fetch(`/api/session-summary?since=${encodeURIComponent(since)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<SessionSummaryData>) : null))
      .then((data) => {
        if (data && data.attempts > 0) setOffer({ runId, data });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [status, runId, startedAt]);

  const open = offer !== null && offer.runId === runId && status === "done";
  return { summary: open ? offer.data : null, dismiss: () => setOffer(null) };
}
