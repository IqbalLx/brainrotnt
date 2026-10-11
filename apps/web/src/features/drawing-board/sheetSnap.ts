// Heights the drawing sheet rests at, as fractions of the viewport. A quarter of the screen was
// too small to draw in, so the sheet starts at half.
export const SNAPS = [0.5, 0.75, 1] as const;
export type Snap = (typeof SNAPS)[number];

export const DEFAULT_SNAP: Snap = 0.5;

// A release faster than this (viewport heights per second, about 500 px/s on a laptop) moves one snap
// in the flick's direction, even if the sheet has not been dragged past the halfway point between snaps.
// A quick 60 px flick measured in Chromium was about 1.1, so the bar sits well below that.
const FLICK = 0.6;
// Dragged below this, halfway down from the smallest snap, the sheet closes instead of resting.
const CLOSE_BELOW = SNAPS[0] / 2;

/**
 * Where the sheet settles when a drag ends: `fraction` is its height then, `velocity` how fast it
 * was growing (positive) or shrinking (negative), in viewport heights per second. Null means close.
 */
export function settle(fraction: number, velocity: number): Snap | null {
  if (fraction < CLOSE_BELOW || (fraction < SNAPS[0] && velocity < -FLICK)) return null;
  if (Math.abs(velocity) > FLICK) {
    return velocity > 0 ? (SNAPS.find((snap) => snap > fraction + 0.01) ?? SNAPS[SNAPS.length - 1]) : ([...SNAPS].reverse().find((snap) => snap < fraction - 0.01) ?? SNAPS[0]);
  }
  return SNAPS.reduce((best, snap) => (Math.abs(snap - fraction) < Math.abs(best - fraction) ? snap : best));
}

/** The next snap up (+1) or down (-1), staying within the range: for keyboard and buttons. */
export function step(current: Snap, direction: 1 | -1): Snap {
  const index = SNAPS.indexOf(current) + direction;
  return SNAPS[Math.min(Math.max(index, 0), SNAPS.length - 1)];
}

export function isSnap(value: unknown): value is Snap {
  return SNAPS.includes(value as Snap);
}
