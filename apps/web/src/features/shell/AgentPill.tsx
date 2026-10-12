import { cn } from "@/lib/utils";
import type { AgentState, AgentStateEvent } from "../agent-state/useAgentState";
import { formatElapsed } from "../run-timer/timerState";

// State names match the Luvus feed; the word is never reworded.
const LABEL: Record<AgentState, string> = { idle: "Idle", working: "Working", blocked: "Blocked", done: "Done" };
const TONE: Record<AgentState, { dot: string; border: string }> = {
  idle: { dot: "bg-ink-faint", border: "border-border" },
  working: { dot: "bg-info", border: "border-info/40" },
  blocked: { dot: "bg-blocked", border: "border-blocked/50" },
  done: { dot: "bg-success", border: "border-success/40" },
};

// The agent at a glance: who, how long this run has been going, and its state.
export function AgentPill({ status, event, runMs }: { status: AgentState; event: AgentStateEvent | null; runMs: number }) {
  const tone = TONE[status];
  const who = [event?.machine, event?.agent, event?.project].filter(Boolean).join(" · ");
  return (
    <div className={cn("flex items-center gap-2 rounded-full border bg-surface-raised px-3 py-1", tone.border)}>
      <span className="relative flex size-2" aria-hidden>
        {(status === "working" || status === "blocked") && (
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", tone.dot)} />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", tone.dot)} />
      </span>
      {who && <span className="hidden max-w-48 truncate text-code text-ink-muted md:inline">{who}</span>}
      <span role="timer" aria-label="Agent run time" className="text-code text-ink">
        {formatElapsed(runMs)}
      </span>
      <span role="status" aria-live="polite" className="text-label uppercase text-ink-muted">
        {LABEL[status]}
      </span>
    </div>
  );
}
