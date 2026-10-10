import { Badge } from "@/components/ui/badge";
import type { AgentState, AgentStateEvent } from "./useAgentState";

// State names match the Luvus feed exactly; the label is never reworded.
const LABEL: Record<AgentState, string> = { idle: "Idle", working: "Working", blocked: "Blocked", done: "Done" };
const VARIANT = { idle: "muted", working: "brand", blocked: "blocked", done: "success" } as const;
const DOT: Record<AgentState, string> = {
  idle: "bg-ink-faint",
  working: "bg-on-brand",
  blocked: "bg-on-blocked",
  done: "bg-on-success",
};

export function AgentStateBadge({ status }: { status: AgentState }) {
  return (
    <Badge variant={VARIANT[status]} className="py-2" role="status" aria-live="polite">
      <span className={`size-2 rounded-full ${DOT[status]}`} aria-hidden />
      {LABEL[status]}
    </Badge>
  );
}

function describe(event: AgentStateEvent) {
  return [event.agent, event.project || event.cwd, event.branch].filter(Boolean).join(" · ");
}

// The one state allowed to interrupt: pinned to the top of the window until the agent's state changes.
export function BlockedBanner({ event }: { event: AgentStateEvent | null }) {
  return (
    <div role="alert" className="sticky top-0 z-10 w-full bg-blocked text-on-blocked">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-on-blocked" aria-hidden />
          <span className="text-heading-sm uppercase">Blocked</span>
          {event && <span className="truncate text-body-sm opacity-85">{describe(event)}</span>}
        </div>
        <span className="shrink-0 text-body-sm opacity-85">waiting on you</span>
      </div>
    </div>
  );
}
