import { Badge } from "@/components/ui/badge";
import type { AgentState } from "./useAgentState";

// State names match the Luvus feed exactly; the label is never reworded.
const LABEL: Record<AgentState, string> = { idle: "Idle", working: "Working", blocked: "Blocked", done: "Done" };
const VARIANT = { idle: "muted", working: "info", blocked: "blocked", done: "success" } as const;
const DOT: Record<AgentState, string> = {
  idle: "bg-ink-faint",
  working: "bg-info",
  blocked: "bg-blocked",
  done: "bg-success",
};

export function AgentStateBadge({ status }: { status: AgentState }) {
  return (
    <Badge variant={VARIANT[status]} className="py-1.5" role="status" aria-live="polite">
      <span className="relative flex size-2" aria-hidden>
        {(status === "working" || status === "blocked") && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${DOT[status]}`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${DOT[status]}`} />
      </span>
      {LABEL[status]}
    </Badge>
  );
}
