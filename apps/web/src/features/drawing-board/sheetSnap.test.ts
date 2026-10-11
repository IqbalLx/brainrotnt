import { describe, expect, test } from "bun:test";
import { settle, step } from "./sheetSnap";

describe("settle", () => {
  test("a slow release rests at the nearest snap", () => {
    expect(settle(0.55, 0)).toBe(0.5);
    expect(settle(0.66, 0)).toBe(0.75);
    expect(settle(0.85, 0.2)).toBe(0.75);
    expect(settle(0.9, -0.3)).toBe(1);
  });

  test("there is no quarter-height snap: a slow release just above it rests at half", () => {
    expect(settle(0.3, 0)).toBe(0.5);
    expect(settle(0.26, 0)).toBe(0.5);
  });

  test("a flick moves one snap in its direction", () => {
    expect(settle(0.55, 2)).toBe(0.75);
    expect(settle(0.8, -2)).toBe(0.75);
    expect(settle(0.7, -2)).toBe(0.5);
    expect(settle(0.98, 3)).toBe(1);
    // A short flick: 60 px in 69 ms on an 800 px screen.
    expect(settle(0.5 + 60 / 800, 60 / 800 / 0.069)).toBe(0.75);
  });

  test("dragging below a quarter, or flicking down from below half, closes the sheet", () => {
    expect(settle(0.2, 0)).toBeNull();
    expect(settle(0.45, -2)).toBeNull();
    expect(settle(0.45, 0)).toBe(0.5);
  });
});

describe("step", () => {
  test("moves one snap and stops at either end", () => {
    expect(step(0.5, 1)).toBe(0.75);
    expect(step(0.75, -1)).toBe(0.5);
    expect(step(1, 1)).toBe(1);
    expect(step(0.5, -1)).toBe(0.5);
  });
});
