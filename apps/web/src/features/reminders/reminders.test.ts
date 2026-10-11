import { describe, expect, test } from "bun:test";
import type { AgentState } from "../agent-state/useAgentState";
import { activeReminder, dismiss, initialReminders, nextFinishedAt, snooze } from "./reminders";

const T = "2026-10-11T10:00:00Z";

// Replays agent states through nextFinishedAt, as useAgentState does, and returns where it ends up.
function replay(states: [AgentState, string][]): string | null {
  let previous: AgentState | null = null;
  let finishedAt: string | null = null;
  for (const [status, at] of states) {
    finishedAt = nextFinishedAt(previous, status, at, finishedAt);
    previous = status;
  }
  return finishedAt;
}

describe("nextFinishedAt", () => {
  test("leaving Working for Idle or Done marks the run finished", () => {
    expect(replay([["working", "t1"], ["idle", "t2"]])).toBe("t2");
    expect(replay([["working", "t1"], ["done", "t2"]])).toBe("t2");
    expect(replay([["blocked", "t1"], ["idle", "t2"]])).toBe("t2");
  });

  test("Done turning into Idle keeps the moment the run finished", () => {
    expect(replay([["working", "t1"], ["done", "t2"], ["idle", "t3"]])).toBe("t2");
    expect(replay([["working", "t1"], ["idle", "t2"], ["idle", "t3"]])).toBe("t2");
  });

  test("a new run clears it, and the next finish gets a new moment", () => {
    expect(replay([["working", "t1"], ["idle", "t2"], ["working", "t3"]])).toBeNull();
    expect(replay([["working", "t1"], ["idle", "t2"], ["working", "t3"], ["idle", "t4"]])).toBe("t4");
  });

  test("a first Done counts, a first Idle does not", () => {
    expect(replay([["done", "t1"]])).toBe("t1");
    expect(replay([["idle", "t1"]])).toBeNull();
    expect(replay([["idle", "t1"], ["done", "t2"]])).toBe("t2");
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
});
