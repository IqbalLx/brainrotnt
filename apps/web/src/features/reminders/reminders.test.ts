import { describe, expect, test } from "bun:test";
import type { AgentState } from "../agent-state/useAgentState";
import { activeReminder, dismiss, type FinishPoint, initialReminders, nextFinish, nextRunStartedAt, snooze } from "./reminders";

const T = "2026-10-11T10:00:00Z";

type Step = [AgentState, string, string?];

// Replays agent states (status, at, pane, default "1") through nextFinish, as useAgentState does, and
// returns the finish it ends up on.
function replayFinish(steps: Step[]): FinishPoint | null {
  let previous: AgentState | null = null;
  let finish: FinishPoint | null = null;
  for (const [status, at, pane = "1"] of steps) {
    finish = nextFinish(previous, { status, at, pane }, finish);
    previous = status;
  }
  return finish;
}

const replay = (steps: Step[]) => replayFinish(steps)?.at ?? null;

describe("nextFinish", () => {
  test("leaving Working for Idle or Done marks the run finished", () => {
    expect(replay([["working", "t1"], ["idle", "t2"]])).toBe("t2");
    expect(replay([["working", "t1"], ["done", "t2"]])).toBe("t2");
    expect(replay([["blocked", "t1"], ["idle", "t2"]])).toBe("t2");
  });

  test("Done turning into Idle keeps the moment the run finished", () => {
    expect(replay([["working", "t1"], ["done", "t2"], ["idle", "t3"]])).toBe("t2");
    expect(replay([["working", "t1"], ["idle", "t2"], ["idle", "t3"]])).toBe("t2");
  });

  test("the agent that finished starting again clears it, and its next finish is new", () => {
    expect(replay([["working", "t1"], ["idle", "t2"], ["working", "t3"]])).toBeNull();
    expect(replay([["working", "t1"], ["idle", "t2"], ["working", "t3"], ["idle", "t4"]])).toBe("t4");
  });

  test("a first Done counts, a first Idle does not", () => {
    expect(replay([["done", "t1"]])).toBe("t1");
    expect(replay([["idle", "t1"]])).toBeNull();
    expect(replay([["idle", "t1"], ["done", "t2"]])).toBe("t2");
  });

  test("another pane or machine starting clears it, so it never contradicts Working", () => {
    const steps: Step[] = [["working", "t1", "a"], ["done", "t2", "a"], ["working", "t3", "gpu:b"]];
    expect(replayFinish(steps)).toBeNull();
    expect(replayFinish([...steps, ["done", "t4", "gpu:b"]])).toEqual({ status: "done", at: "t4", pane: "gpu:b" });
    expect(replay([...steps, ["blocked", "t4", "gpu:b"], ["working", "t5", "gpu:b"], ["idle", "t6", "gpu:b"]])).toBe("t6");
  });

  test("a finish seen before the pane started working again does not linger", () => {
    // A finish hours old must not come back as the reminder while another agent works.
    expect(replay([["working", "t1", "shell"], ["idle", "t2", "shell"], ["working", "t3", "agent"]])).toBeNull();
  });
});

function replayRun(states: [AgentState, string][]): string | null {
  let previous: AgentState | null = null;
  let startedAt: string | null = null;
  for (const [status, at] of states) {
    startedAt = nextRunStartedAt(previous, status, at, startedAt);
    previous = status;
  }
  return startedAt;
}

describe("nextRunStartedAt", () => {
  test("Idle or Done to Working starts a run, and Blocked in the middle keeps its moment", () => {
    expect(replayRun([["idle", "t1"], ["working", T]])).toBe(T);
    expect(replayRun([["done", "t1"], ["working", T], ["blocked", "t3"], ["working", "t4"]])).toBe(T);
  });

  test("the first state is a baseline, so a page loaded mid-run starts nothing", () => {
    expect(replayRun([["working", T]])).toBeNull();
    expect(replayRun([["blocked", "t1"], ["working", T]])).toBeNull();
  });

  test("finishing clears it, and the next run gets a new moment", () => {
    expect(replayRun([["idle", "t1"], ["working", T], ["done", "t3"]])).toBeNull();
    expect(replayRun([["idle", "t1"], ["working", T], ["idle", "t3"], ["working", "t4"]])).toBe("t4");
  });
});

describe("activeReminder", () => {
  test("blocked always reminds; a finished run only while a session is open", () => {
    expect(activeReminder("blocked", T, null, false, initialReminders, 0)).toEqual({ kind: "blocked", since: T });
    expect(activeReminder("done", T, T, true, initialReminders, 0)).toEqual({ kind: "done", since: T });
    expect(activeReminder("done", T, T, false, initialReminders, 0)).toBeNull();
    expect(activeReminder("working", T, null, true, initialReminders, 0)).toBeNull();
    expect(activeReminder("idle", T, null, true, initialReminders, 0)).toBeNull();
    expect(activeReminder("blocked", null, null, true, initialReminders, 0)).toBeNull();
  });

  test("an agent that goes from Working to Idle reminds like Done", () => {
    const finishedAt = replay([["working", "t1"], ["idle", T]]);
    expect(activeReminder("idle", T, finishedAt, true, initialReminders, 0)).toEqual({ kind: "done", since: T });
  });

  test("the reminder survives Done turning into Idle, and a snooze still covers it", () => {
    const finishedAt = replay([["working", "t1"], ["done", T], ["idle", "t3"]]);
    expect(activeReminder("idle", "t3", finishedAt, true, initialReminders, 0)).toEqual({ kind: "done", since: T });
    const state = snooze(initialReminders, { kind: "done", since: T }, 30_000, 0);
    expect(activeReminder("idle", "t3", finishedAt, true, state, 10)).toBeNull();
  });

  test("a snooze hides the reminder until it runs out, then it comes back", () => {
    const key = { kind: "done" as const, since: T };
    const state = snooze(initialReminders, key, 30_000, 1_000);
    expect(activeReminder("done", T, T, true, state, 30_999)).toBeNull();
    expect(activeReminder("done", T, T, true, state, 31_000)).toEqual(key);
  });

  test("a snooze only covers the occurrence it was set for", () => {
    const state = snooze(initialReminders, { kind: "blocked", since: T }, 300_000, 0);
    expect(activeReminder("blocked", "2026-10-11T10:01:00Z", null, true, state, 10)).toEqual({ kind: "blocked", since: "2026-10-11T10:01:00Z" });
    expect(activeReminder("done", T, T, true, state, 10)).toEqual({ kind: "done", since: T });
  });

  test("dismissing a blocked reminder silences it until the agent is blocked again", () => {
    const state = dismiss(initialReminders, { kind: "blocked", since: T });
    expect(activeReminder("blocked", T, null, true, state, 0)).toBeNull();
    expect(activeReminder("blocked", "2026-10-11T10:05:00Z", null, true, state, 0)).not.toBeNull();
  });

  test("a new run offers a session only while one could start", () => {
    const offer = { kind: "working" as const, since: T };
    expect(activeReminder("working", T, null, false, initialReminders, 0, { startedAt: T, canStart: true })).toEqual(offer);
    expect(activeReminder("working", T, null, true, initialReminders, 0, { startedAt: T, canStart: false })).toBeNull();
    expect(activeReminder("working", T, null, false, initialReminders, 0, { startedAt: null, canStart: true })).toBeNull();
    expect(activeReminder("done", T, null, false, initialReminders, 0, { startedAt: T, canStart: true })).toBeNull();
  });

  test("blocked takes over from the offer, which returns for the same run unless dismissed", () => {
    const run = { startedAt: T, canStart: true };
    expect(activeReminder("blocked", "t2", null, false, initialReminders, 0, run)).toEqual({ kind: "blocked", since: "t2" });
    expect(activeReminder("working", "t3", null, false, initialReminders, 0, run)).toEqual({ kind: "working", since: T });
    const state = dismiss(initialReminders, { kind: "working", since: T });
    expect(activeReminder("working", "t3", null, false, state, 0, run)).toBeNull();
    expect(activeReminder("working", "t5", null, false, state, 0, { startedAt: "t5", canStart: true })).toEqual({ kind: "working", since: "t5" });
  });

  test("no done reminder while another agent works, and its own finish is a new one", () => {
    const meanwhile = replay([["working", "t1", "a"], ["done", T, "a"], ["working", "t3", "gpu:b"]]);
    expect(activeReminder("working", "t3", meanwhile, true, initialReminders, 0)).toBeNull();
    const finishedAt = replay([["working", "t1", "a"], ["done", T, "a"], ["working", "t3", "gpu:b"], ["done", "t4", "gpu:b"]]);
    const dismissed = dismiss(initialReminders, { kind: "done", since: T });
    expect(activeReminder("done", "t4", finishedAt, true, dismissed, 0)).toEqual({ kind: "done", since: "t4" });
  });

  test("a snoozed offer comes back after the snooze while the run goes on", () => {
    const run = { startedAt: T, canStart: true };
    const state = snooze(initialReminders, { kind: "working", since: T }, 30_000, 0);
    expect(activeReminder("working", T, null, false, state, 29_999, run)).toBeNull();
    expect(activeReminder("working", T, null, false, state, 30_000, run)).toEqual({ kind: "working", since: T });
  });
});
