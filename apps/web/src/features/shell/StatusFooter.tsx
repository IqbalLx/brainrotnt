import { cn } from "@/lib/utils";
import type { AgentStateEvent } from "../agent-state/useAgentState";
import type { Health } from "./useHealth";

const SANDBOX = { strict: "isolated", "unsandboxed-allowed": "not isolated", unavailable: "unavailable" } as const;

const REPO_URL = "https://github.com/IqbalLx/brainrotnt";

// GitHub's mark, inlined: the icon set no longer ships brand logos, and nothing is fetched from a CDN.
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// A quiet status bar: is the bridge there, is the agent feed live, and how untrusted code runs; then who
// made the app and where its source lives.
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
          <span className="min-w-0 flex-1 truncate">
            {event.cwd}
            {event.branch ? ` · ${event.branch}` : ""}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span>brainrotnt by Iqbal Maulana</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="brainrotnt on GitHub (opens in a new tab)"
            title="brainrotnt on GitHub"
            className="rounded-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <GitHubMark className="size-4" />
          </a>
        </span>
      </div>
    </footer>
  );
}
