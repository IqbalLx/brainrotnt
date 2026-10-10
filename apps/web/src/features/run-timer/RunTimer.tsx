import { formatElapsed } from "./timerState";

export function RunTimer({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="mt-4 flex items-baseline gap-3">
      <span role="timer" className="text-display-lg tabular-nums text-ink">
        {formatElapsed(elapsedMs)}
      </span>
      <span className="text-body-sm text-ink-muted">elapsed</span>
    </div>
  );
}
