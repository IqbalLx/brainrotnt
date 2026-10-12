import { useEffect, useState } from "react";
import { BellOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentStateEvent } from "../agent-state/useAgentState";
import { SNOOZE_OPTIONS, type ReminderKey } from "./reminders";

interface ReminderCardProps {
  reminder: ReminderKey;
  event: AgentStateEvent | null;
  onAct: () => void;
  onSnooze: (ms: number) => void;
  /** Lets the reminder go without acting on it; only offered where that makes sense. */
  onDismiss?: () => void;
}

const COPY: Record<ReminderKey["kind"], { kicker: string; title: string; body: string; act: string }> = {
  working: {
    kicker: "Agent working",
    title: "Your agent is on it",
    body: "Start a session when you're ready. Read its output first if you like; a short run like planning may finish before a session is worth it.",
    act: "Start session",
  },
  blocked: {
    kicker: "Agent blocked",
    title: "Your agent needs you",
    body: "It is waiting for your input. Answer it in its own terminal, then come back; this app never answers for you.",
    act: "I'll check the agent",
  },
  done: {
    kicker: "Agent done",
    title: "Your agent has finished",
    body: "End the session to see your score and explanations, or keep going a little longer.",
    act: "End session & see score",
  },
};

function ago(since: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  if (Number.isNaN(seconds)) return "";
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

// The one thing allowed to interrupt practice. It asks; it never pauses anything.
export function ReminderCard({ reminder, event, onAct, onSnooze, onDismiss }: ReminderCardProps) {
  const copy = COPY[reminder.kind];
  const blocked = reminder.kind === "blocked";
  const working = reminder.kind === "working";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);
  const where = [event?.machine, event?.agent, event?.project || event?.cwd, event?.branch].filter(Boolean).join(" · ");

  return (
    <section
      role="alert"
      aria-label={copy.title}
      className={cn(
        "flex flex-col gap-5 rounded-lg border bg-surface-raised p-6",
        blocked ? "border-blocked/60 shadow-[0_0_0_1px_var(--blocked)]" : working ? "border-info/50" : "border-success/50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", blocked ? "bg-blocked" : working ? "bg-info" : "bg-success")} aria-hidden />
          <span className={cn("text-label uppercase", blocked ? "text-blocked" : working ? "text-info" : "text-success")}>{copy.kicker}</span>
          {where && <span className="text-code text-ink-muted">/ {where}</span>}
        </div>
        <span className="text-code text-ink-faint">{ago(reminder.since, now)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-heading-lg text-ink">{copy.title}</h2>
        <p className="text-body text-ink-muted">{copy.body}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onAct} className={cn("h-10 px-5", blocked && "bg-blocked text-on-blocked")}>
          {copy.act}
        </Button>
        {onDismiss && (
          <Button variant="ghost" className="h-10" onClick={onDismiss}>
            Not this run
          </Button>
        )}
        <span className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <BellOff className="size-4" aria-hidden />
          Remind me in
        </span>
        {SNOOZE_OPTIONS.map((option) => (
          <Button key={option.label} variant="outline" size="sm" aria-label={`Remind me in ${option.label}`} onClick={() => onSnooze(option.ms)}>
            {option.label}
          </Button>
        ))}
      </div>

      {!working && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-sunken px-4 py-3 text-body-sm text-ink-muted">
        <Info className="size-4 shrink-0 text-info" aria-hidden />
          Practice carries on: nothing is paused and your answers keep counting.
        </div>
      )}
    </section>
  );
}
