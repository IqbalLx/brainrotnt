import { useEffect, useRef } from "react";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { SubjectSettingsBar } from "@/features/exercise-engine/SubjectSettingsBar";
import { ReminderCard } from "@/features/reminders/ReminderCard";
import { useReminders } from "@/features/reminders/useReminders";
import { useRunTimer } from "@/features/run-timer/useRunTimer";
import { SessionPanel } from "@/features/session/SessionPanel";
import { useSession } from "@/features/session/useSession";
import { useSettings } from "@/features/settings/useSettings";
import { AgentPill } from "@/features/shell/AgentPill";
import { StatusFooter } from "@/features/shell/StatusFooter";
import { useHealth } from "@/features/shell/useHealth";

export default function App() {
  const { event, status, since, runStarts, connected } = useAgentState();
  const { settings, update } = useSettings();
  const session = useSession(status);
  const timer = useRunTimer(status);
  const reminders = useReminders(status, since, session.open);
  const health = useHealth();

  // A session starts by itself when the agent starts a new run, unless one is already open or a
  // score screen is being read.
  const handledRunStarts = useRef(0);
  useEffect(() => {
    if (runStarts === handledRunStarts.current) return;
    handledRunStarts.current = runStarts;
    if (session.phase === "none" || session.phase === "empty") void session.start(settings, "agent");
  }, [runStarts, session, settings]);

  const inSession = session.phase === "answering" || session.phase === "submitting" || session.phase === "result";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-info" aria-hidden />
            <h1 className="text-code-lg font-semibold text-ink">brainrotnt</h1>
            <span className="hidden text-caption text-ink-faint sm:inline">Brainrot, not.</span>
          </div>
          <AgentPill status={status} event={event} runMs={timer.elapsedMs} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        {reminders.reminder && (
          <ReminderCard
            reminder={reminders.reminder}
            event={event}
            onAct={() => {
              const reminder = reminders.reminder!;
              reminders.dismiss(reminder);
              if (reminder.kind === "done") void session.end();
            }}
            onSnooze={(ms) => reminders.snooze(reminders.reminder!, ms)}
          />
        )}
        {!inSession && <SubjectSettingsBar settings={settings} onChange={update} />}
        <SessionPanel
          session={session}
          calculatorCeiling={settings.calculator}
          sessionSize={settings.sessionSize}
          agentWorking={status === "working"}
          onStart={() => void session.start(settings, "manual")}
        />
      </main>

      <StatusFooter health={health} streamConnected={connected} event={event} />
    </div>
  );
}
