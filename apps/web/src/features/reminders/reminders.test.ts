import { describe, expect, test } from "bun:test";
import { activeReminder, dismiss, initialReminders, snooze } from "./reminders";

const T = "2026-10-11T10:00:00Z";

describe("activeReminder", () => {
  test("blocked always reminds; done only while a session is open", () => {
    expect(activeReminder("blocked", T, false, initialReminders, 0)).toEqual({ kind: "blocked", since: T });
    expect(activeReminder("done", T, true, initialReminders, 0)).toEqual({ kind: "done", since: T });
    expect(activeReminder("done", T, false, initialReminders, 0)).toBeNull();
    expect(activeReminder("working", T, true, initialReminders, 0)).toBeNull();
    expect(activeReminder("idle", T, true, initialReminders, 0)).toBeNull();
    expect(activeReminder("blocked", null, true, initialReminders, 0)).toBeNull();
  });

  test("a snooze hides the reminder until it runs out, then it comes back", () => {
    const key = { kind: "done" as const, since: T };
    const state = snooze(initialReminders, key, 30_000, 1_000);
    expect(activeReminder("done", T, true, state, 30_999)).toBeNull();
    expect(activeReminder("done", T, true, state, 31_000)).toEqual(key);
  });

  test("a snooze only covers the occurrence it was set for", () => {
    const state = snooze(initialReminders, { kind: "blocked", since: T }, 300_000, 0);
    expect(activeReminder("blocked", "2026-10-11T10:01:00Z", true, state, 10)).toEqual({ kind: "blocked", since: "2026-10-11T10:01:00Z" });
    expect(activeReminder("done", T, true, state, 10)).toEqual({ kind: "done", since: T });
  });

  test("dismissing a blocked reminder silences it until the agent is blocked again", () => {
    const state = dismiss(initialReminders, { kind: "blocked", since: T });
    expect(activeReminder("blocked", T, true, state, 0)).toBeNull();
    expect(activeReminder("blocked", "2026-10-11T10:05:00Z", true, state, 0)).not.toBeNull();
  });
});
