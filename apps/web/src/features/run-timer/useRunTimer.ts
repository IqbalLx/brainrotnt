import { useEffect, useState } from "react";
import type { AgentState } from "../agent-state/useAgentState";
import { advance, elapsedMs, initialRunTimer } from "./timerState";

export function useRunTimer(status: AgentState) {
  const [state, setState] = useState(initialRunTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setState((current) => advance(current, status, Date.now()));
  }, [status]);

  const running = state.resumedAt !== null;
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  return {
    runId: state.runId,
    startedAt: state.startedAt,
    running,
    elapsedMs: elapsedMs(state, running ? Math.max(now, state.resumedAt ?? 0) : now),
  };
}
