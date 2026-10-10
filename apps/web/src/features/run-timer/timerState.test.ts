import { describe, expect, test } from "bun:test";
import { advance, elapsedMs, formatElapsed, initialRunTimer } from "./timerState";

describe("run timer", () => {
  test("idle never starts a run", () => {
    const state = advance(initialRunTimer, "idle", 1_000);
    expect(state).toEqual(initialRunTimer);
    expect(elapsedMs(state, 9_000)).toBe(0);
  });

  test("working starts a run and counts through blocked", () => {
    let state = advance(initialRunTimer, "working", 1_000);
    expect(state.runId).toBe(1);
    expect(state.startedAt).toBe(1_000);
    state = advance(state, "blocked", 4_000);
    state = advance(state, "working", 6_000);
    expect(state.runId).toBe(1);
    expect(elapsedMs(state, 11_000)).toBe(10_000);
  });

  test("done pauses and the elapsed time stays frozen", () => {
    let state = advance(initialRunTimer, "working", 0);
    state = advance(state, "done", 42_000);
    expect(elapsedMs(state, 42_000)).toBe(42_000);
    expect(elapsedMs(state, 500_000)).toBe(42_000);
    state = advance(state, "idle", 600_000);
    expect(elapsedMs(state, 900_000)).toBe(42_000);
  });

  test("the next working period starts a fresh run", () => {
    let state = advance(initialRunTimer, "working", 0);
    state = advance(state, "done", 30_000);
    state = advance(state, "working", 100_000);
    expect(state.runId).toBe(2);
    expect(state.startedAt).toBe(100_000);
    expect(elapsedMs(state, 105_000)).toBe(5_000);
  });

  test("repeating the same status changes nothing", () => {
    const running = advance(initialRunTimer, "working", 0);
    expect(advance(running, "working", 5_000)).toBe(running);
  });
});

describe("formatElapsed", () => {
  test("formats minutes, seconds and hours", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(42_900)).toBe("00:42");
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("00:00");
  });
});
