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

/** The state at a finish: when, and on which pane (unique across Luvus machines). */
export interface FinishPoint {
  status: AgentState;
  pane: string;
  at: string;
}

/**
 * The finish the done reminder is about, or null while nothing has finished. Luvus reports a finished
 * turn as Done or as Idle (and moves Done to Idle after a while), so leaving Working or Blocked for either
 * one counts, and Done to Idle keeps the same finish. A first Done counts too, so a page loaded after the
 * agent finished still reminds; a first Idle does not, since nothing says a run just ended.
 *
 * With agents on several panes or machines, one finish stands for them all until it is acknowledged
 * (`acknowledged`: the session it reminded about has ended): another agent starting or finishing keeps
 * it, so the reminder neither disappears nor comes back as new. Only the agent that finished starting
 * again clears it. Agents that overlap need nothing here: the bridge shows Working while any of them
 * works, so only the last one to finish is seen finishing.
 */
export function nextFinish<T extends FinishPoint>(previous: AgentState | null, next: T, finish: T | null, acknowledged: boolean): T | null {
  const held = finish !== null && !acknowledged;
  if (busy(next.status)) return held && next.pane !== finish.pane ? finish : null;
  if (busy(previous)) return held ? finish : next;
  if (finish === null && next.status === "done") return next;
  return finish;
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
// the middle does not bring a dismissed offer back. `since` is when the agent entered its status, `finishedAt` when the
// finish the reminder is about happened (see nextFinish), which can outlast another agent starting to work.
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
