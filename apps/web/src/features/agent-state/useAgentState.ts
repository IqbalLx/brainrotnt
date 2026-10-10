import { useEffect, useState } from "react";

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
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/agent-state/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("agent-state", (e) => {
      setEvent(JSON.parse((e as MessageEvent).data) as AgentStateEvent);
    });
    return () => source.close();
  }, []);

  return { event, status: event?.status ?? "idle", connected };
}
