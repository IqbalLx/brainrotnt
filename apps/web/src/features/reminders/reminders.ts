import type { AgentState } from "../agent-state/useAgentState";

export const SNOOZE_OPTIONS = [
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "2m", ms: 120_000 },
  { label: "5m", ms: 300_000 },
] as const;

export type ReminderKind = "done" | "blocked";

/** Identifies one occurrence: snoozing or dismissing it says nothing about the next one. */
export interface ReminderKey {
  kind: ReminderKind;
  since: string;
}

export interface ReminderState {
  snoozed: (ReminderKey & { until: number }) | null;
  dismissed: ReminderKey | null;
}

export const initialReminders: ReminderState = { snoozed: null, dismissed: null };

const same = (a: ReminderKey | null, b: ReminderKey) => a !== null && a.kind === b.kind && a.since === b.since;

// Blocked always deserves a nudge; Done only matters while a session is still open, since it asks
// whether to end it. `since` is when the agent entered that state.
export function activeReminder(
  status: AgentState,
  since: string | null,
  sessionOpen: boolean,
  state: ReminderState,
  now: number,
): ReminderKey | null {
  if (since === null) return null;
  const key: ReminderKey | null =
    status === "blocked" ? { kind: "blocked", since } : status === "done" && sessionOpen ? { kind: "done", since } : null;
  if (!key) return null;
  if (same(state.dismissed, key)) return null;
  if (state.snoozed && same(state.snoozed, key) && state.snoozed.until > now) return null;
  return key;
}

export const snooze = (state: ReminderState, key: ReminderKey, ms: number, now: number): ReminderState => ({
  ...state,
  snoozed: { ...key, until: now + ms },
});

export const dismiss = (state: ReminderState, key: ReminderKey): ReminderState => ({ ...state, dismissed: key });
