import { Badge } from "@/components/ui/badge";
import type { AgentState } from "./useAgentState";

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
