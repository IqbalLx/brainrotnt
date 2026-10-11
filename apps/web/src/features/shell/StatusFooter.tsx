import { cn } from "@/lib/utils";
import type { AgentStateEvent } from "../agent-state/useAgentState";
import type { Health } from "./useHealth";

const SANDBOX = { strict: "isolated", "unsandboxed-allowed": "not isolated", unavailable: "unavailable" } as const;

// A quiet status bar: is the bridge there, is the agent feed live, and how untrusted code runs.
export function StatusFooter({ health, streamConnected, event }: { health: Health; streamConnected: boolean; event: AgentStateEvent | null }) {
  const item = (ok: boolean, text: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", ok ? "bg-success" : "bg-danger")} aria-hidden />
      {text}
    </span>
  );
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 text-code text-ink-faint md:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {item(health.online, health.online ? "bridge: online" : "bridge: unreachable")}
          {item(streamConnected, streamConnected ? "agent feed: live" : "agent feed: reconnecting")}
          {health.sandbox && item(health.sandbox === "strict", `sandbox: ${SANDBOX[health.sandbox]}`)}
        </div>
        {event?.cwd && (
          <span className="truncate">
            {event.cwd}
            {event.branch ? ` · ${event.branch}` : ""}
          </span>
        )}
      </div>
    </footer>
  );
}
