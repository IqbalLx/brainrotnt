import { BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStateEvent } from "../agent-state/useAgentState";
import { SNOOZE_OPTIONS, type ReminderKey } from "./reminders";

interface ReminderBannerProps {
  reminder: ReminderKey;
  event: AgentStateEvent | null;
  onAct: () => void;
  onSnooze: (ms: number) => void;
}

function describe(event: AgentStateEvent) {
  return [event.agent, event.project || event.cwd, event.branch].filter(Boolean).join(" · ");
}

const COPY = {
  blocked: { title: "Your agent needs you", body: "It is waiting on you. Check its work, then come back.", act: "I'll check the agent" },
  done: { title: "Your agent is done", body: "End the session to see your score, or keep going a little longer.", act: "End session & see score" },
};

// Pinned to the top of the window: the one thing allowed to interrupt practice.
export function ReminderBanner({ reminder, event, onAct, onSnooze }: ReminderBannerProps) {
  const copy = COPY[reminder.kind];
  const blocked = reminder.kind === "blocked";
  const button = cn(
    "rounded-full px-3 py-1 text-label uppercase focus-visible:outline-2 focus-visible:outline-offset-2",
    blocked ? "focus-visible:outline-on-blocked" : "focus-visible:outline-on-success",
  );

  return (
    <div role="alert" className={cn("sticky top-0 z-10 w-full", blocked ? "bg-blocked text-on-blocked" : "bg-success text-on-success")}>
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("size-2 shrink-0 rounded-full", blocked ? "bg-on-blocked" : "bg-on-success")} aria-hidden />
          <span className="text-heading-sm uppercase">{copy.title}</span>
          {event && <span className="truncate text-body-sm opacity-85">{describe(event)}</span>}
        </div>
        <p className="text-body-sm opacity-90">{copy.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onAct} className={cn(button, blocked ? "bg-on-blocked text-blocked" : "bg-on-success text-success")}>
            {copy.act}
          </button>
          <span className="ml-2 flex items-center gap-1 text-body-sm opacity-85">
            <BellOff className="size-4" aria-hidden />
            Remind me in
          </span>
          {SNOOZE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-label={`Remind me in ${option.label}`}
              onClick={() => onSnooze(option.ms)}
              className={cn(button, "border", blocked ? "border-on-blocked/40" : "border-on-success/40")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
