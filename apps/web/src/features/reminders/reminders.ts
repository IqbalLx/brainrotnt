import type { AgentState } from "../agent-state/useAgentState";

export const SNOOZE_OPTIONS = [
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "2m", ms: 120_000 },
  { label: "5m", ms: 300_000 },
] as const;

export type ReminderKind = "done" | "blocked" | "working";

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

/**
 * When the current run started, or null outside a run. Only Idle or Done to Working starts one, so the
 * first state a page receives is a baseline and loading the page mid-run starts nothing; Blocked in the
 * middle of a run keeps the same moment.
 */
export function nextRunStartedAt(previous: AgentState | null, status: AgentState, at: string, runStartedAt: string | null): string | null {
  if (!busy(status)) return null;
  if ((previous === "idle" || previous === "done") && status === "working") return at;
  return runStartedAt;
}

export interface RunOffer {
  /** When the current run started (see nextRunStartedAt). */
  startedAt: string | null;
  /** Whether a session could start now: none is open and no score screen is being read. */
  canStart: boolean;
}

const noOffer: RunOffer = { startedAt: null, canStart: false };

// Blocked always deserves a nudge; a finished run only matters while a session is still open, since it
// asks whether to end it. A new run offers to start a session, keyed by the run so a Blocked moment in
// the middle does not bring a dismissed offer back. `since` is when the agent entered its status, `finishedAt` when it last
// finished a run (see nextFinishedAt).
export function activeReminder(
  status: AgentState,
  since: string | null,
  finishedAt: string | null,
  sessionOpen: boolean,
  state: ReminderState,
  now: number,
  run: RunOffer = noOffer,
): ReminderKey | null {
  const key: ReminderKey | null =
    status === "blocked"
      ? since === null
        ? null
        : { kind: "blocked", since }
      : finishedAt !== null && sessionOpen
        ? { kind: "done", since: finishedAt }
        : status === "working" && run.startedAt !== null && run.canStart
          ? { kind: "working", since: run.startedAt }
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
