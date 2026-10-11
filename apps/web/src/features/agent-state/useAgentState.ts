import { useEffect, useRef, useState } from "react";

export type AgentState = "idle" | "working" | "blocked" | "done";

export interface AgentStateEvent {
  status: AgentState;
  pane: string;
  agent: string;
  project: string;
  cwd: string;
  branch: string | null;
  at: string;
}

export function useAgentState() {
  const [event, setEvent] = useState<AgentStateEvent | null>(null);
  // When the current status began. The bridge re-publishes on any pane change, so `at` alone moves
  // even while the status stays the same.
  const [since, setSince] = useState<string | null>(null);
  const lastStatus = useRef<AgentState | null>(null);
  // Counts the agent starting a new run (idle or done -> working). Counted here, as events arrive,
  // because React may batch two events into one render and hide the transition from an effect.
  // The first event is only a baseline, so loading the page mid-run does not count.
  const [runStarts, setRunStarts] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/agent-state/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("agent-state", (e) => {
      const next = JSON.parse((e as MessageEvent).data) as AgentStateEvent;
      if (lastStatus.current !== next.status) setSince(next.at);
      if ((lastStatus.current === "idle" || lastStatus.current === "done") && next.status === "working") setRunStarts((n) => n + 1);
      lastStatus.current = next.status;
      setEvent(next);
    });
    return () => source.close();
  }, []);

  return { event, status: event?.status ?? "idle", since, runStarts, connected };
}
