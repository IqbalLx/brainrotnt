import { AlertTriangle, CheckCircle2, Loader2, Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentState, AgentStateEvent } from "./useAgentState";

const COPY: Record<AgentState, { label: string; detail: string }> = {
  idle: { label: "Idle", detail: "Your agent is waiting for you." },
  working: { label: "Working", detail: "Your agent is busy. Solve something." },
  blocked: { label: "Blocked", detail: "Your agent needs you. Go to your terminal." },
  done: { label: "Done", detail: "Your agent finished. Timer paused." },
};

const ICON: Record<AgentState, typeof Moon> = {
  idle: Moon,
  working: Loader2,
  blocked: AlertTriangle,
  done: CheckCircle2,
};

export function AgentStateBanner({ status, event }: { status: AgentState; event: AgentStateEvent | null }) {
  const Icon = ICON[status];
  const { label, detail } = COPY[status];
  const blocked = status === "blocked";

  return (
    <div
      role={blocked ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        blocked && "border-destructive bg-destructive text-white",
      )}
    >
      <Icon className={cn("size-5", status === "working" && "animate-spin")} />
      <div className="flex-1">
        <div className="font-medium">{detail}</div>
        {event?.agent && (
          <div className={cn("text-xs", blocked ? "text-white/80" : "text-muted-foreground")}>
            {event.agent} · {event.cwd}
            {event.branch ? ` · ${event.branch}` : ""}
          </div>
        )}
      </div>
      <Badge variant={blocked ? "outline" : "secondary"} className={cn(blocked && "border-white text-white")}>
        {label}
      </Badge>
    </div>
  );
}
