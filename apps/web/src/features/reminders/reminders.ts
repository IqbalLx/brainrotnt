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

const busy = (status: AgentState | null) => status === "working" || status === "blocked";

/**
 * When the agent last finished a run, or null while it is running. Luvus reports a finished turn as
 * Done or as Idle (and moves Done to Idle after a while), so leaving Working or Blocked for either one
 * counts, and Done to Idle keeps the same moment. A first Done counts too, so a page loaded after the
 * agent finished still reminds; a first Idle does not, since nothing says a run just ended.
 */
export function nextFinishedAt(previous: AgentState | null, status: AgentState, at: string, finishedAt: string | null): string | null {
  if (busy(status)) return null;
  if (busy(previous)) return at;
  if (finishedAt === null && status === "done") return at;
  return finishedAt;
}

// Blocked always deserves a nudge; a finished run only matters while a session is still open, since it
// asks whether to end it. `since` is when the agent entered its status, `finishedAt` when it last
// finished a run (see nextFinishedAt).
export function activeReminder(
  status: AgentState,
  since: string | null,
  finishedAt: string | null,
  sessionOpen: boolean,
  state: ReminderState,
  now: number,
): ReminderKey | null {
  const key: ReminderKey | null =
    status === "blocked"
      ? since === null
        ? null
        : { kind: "blocked", since }
      : finishedAt !== null && sessionOpen
        ? { kind: "done", since: finishedAt }
        : null;
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
