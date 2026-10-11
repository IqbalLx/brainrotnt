import { useEffect, useRef, useState } from "react";
import { nextFinishedAt, nextRunStartedAt } from "../reminders/reminders";

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

// Opt-in console trace of the stream: run localStorage.setItem("debug", "agent-state") in the console and reload.
function debugEnabled(): boolean {
  try {
    return localStorage.getItem("debug") === "agent-state";
  } catch {
    return false;
  }
}

export function useAgentState() {
  const [event, setEvent] = useState<AgentStateEvent | null>(null);
  // When the current status began. The bridge re-publishes on any pane change, so `at` alone moves
  // even while the status stays the same.
  const [since, setSince] = useState<string | null>(null);
  const lastStatus = useRef<AgentState | null>(null);
  // When the current run started (idle or done -> working), for the reminder that offers a session;
  // null outside a run. Tracked here, as events arrive, because React may batch two events into one
  // render and hide the transition from an effect. The first event is only a baseline, so loading the
  // page mid-run starts nothing.
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  // When the agent last finished a run (left Working or Blocked for Idle or Done), for the reminder.
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const debug = debugEnabled();
    const trace = (...args: unknown[]) => debug && console.debug(`[agent-state] ${new Date().toISOString().slice(11, 23)}`, ...args);
    let lastId = 0;
    const source = new EventSource("/api/agent-state/stream");
    source.onopen = () => {
      trace("stream open");
      setConnected(true);
    };
    source.onerror = () => {
      trace("stream error, readyState", source.readyState, "(0 = reconnecting, 2 = closed)");
      setConnected(false);
    };
    if (debug) source.addEventListener("ping", () => trace("ping"));
    source.addEventListener("agent-state", (e) => {
      const message = e as MessageEvent;
      const next = JSON.parse(message.data) as AgentStateEvent;
      if (debug) {
        // ids restart at the bridge's counter on reconnect; a jump of more than one means events were missed.
        const id = Number(message.lastEventId);
        const gap = lastId && id > lastId + 1 ? ` GAP: ${id - lastId - 1} missed` : "";
        lastId = id;
        trace(`id=${id} ${next.status} pane=${next.pane} published ${Date.now() - Date.parse(next.at)} ms ago${gap}`, next);
      }
      if (lastStatus.current !== next.status) setSince(next.at);
      const previous = lastStatus.current;
      setFinishedAt((current) => nextFinishedAt(previous, next.status, next.at, current));
      setRunStartedAt((current) => nextRunStartedAt(previous, next.status, next.at, current));
      lastStatus.current = next.status;
      setEvent(next);
    });
    return () => source.close();
  }, []);

  return { event, status: event?.status ?? "idle", since, finishedAt, runStartedAt, connected };
}
