import type { AgentState } from "../agent-state/useAgentState";

// A run is the stretch where the agent is working or blocked; done and idle pause the clock.
export interface RunTimerState {
  runId: number;
  startedAt: number | null;
  accumulatedMs: number;
  resumedAt: number | null;
}

export const initialRunTimer: RunTimerState = { runId: 0, startedAt: null, accumulatedMs: 0, resumedAt: null };

const isRunning = (status: AgentState) => status === "working" || status === "blocked";

export function advance(state: RunTimerState, status: AgentState, now: number): RunTimerState {
  if (isRunning(status) && state.resumedAt === null) {
    return { runId: state.runId + 1, startedAt: now, accumulatedMs: 0, resumedAt: now };
  }
  if (!isRunning(status) && state.resumedAt !== null) {
    return { ...state, accumulatedMs: state.accumulatedMs + (now - state.resumedAt), resumedAt: null };
  }
  return state;
}

export function elapsedMs(state: RunTimerState, now: number): number {
  return state.accumulatedMs + (state.resumedAt === null ? 0 : now - state.resumedAt);
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${String(minutes).padStart(2, "0")}:${seconds}`;
}
