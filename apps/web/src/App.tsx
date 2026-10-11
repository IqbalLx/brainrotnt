import { useEffect, useRef } from "react";
import { AgentStateBadge } from "@/features/agent-state/AgentStatus";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { SubjectSettingsBar } from "@/features/exercise-engine/SubjectSettingsBar";
import { ReminderBanner } from "@/features/reminders/ReminderBanner";
import { useReminders } from "@/features/reminders/useReminders";
import { RunTimer } from "@/features/run-timer/RunTimer";
import { useRunTimer } from "@/features/run-timer/useRunTimer";
import { SessionPanel } from "@/features/session/SessionPanel";
import { useSession } from "@/features/session/useSession";
import { useSettings } from "@/features/settings/useSettings";

export default function App() {
  const { event, status, since, runStarts } = useAgentState();
  const { settings, update } = useSettings();
  const session = useSession(status);
  const timer = useRunTimer(status);
  const reminders = useReminders(status, since, session.open);

  // A session starts by itself when the agent starts a new run, unless one is already open or a
  // score screen is being read.
  const handledRunStarts = useRef(0);
  useEffect(() => {
    if (runStarts === handledRunStarts.current) return;
    handledRunStarts.current = runStarts;
    if (session.phase === "none" || session.phase === "empty") void session.start(settings, "agent");
  }, [runStarts, session, settings]);

  return (
    <>
      {reminders.reminder && (
        <ReminderBanner
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
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-heading-lg">brainrotnt</h1>
            <p className="text-body-sm text-ink-muted">Brainrot, not. Solve STEM problems while your agent codes for you.</p>
          </div>
          <AgentStateBadge status={status} />
        </header>
        <RunTimer elapsedMs={timer.elapsedMs} />
        <SubjectSettingsBar settings={settings} onChange={update} />
        <SessionPanel
          session={session}
          calculatorCeiling={settings.calculator}
          sessionSize={settings.sessionSize}
          agentWorking={status === "working"}
          onStart={() => void session.start(settings, "manual")}
        />
      </main>
    </>
  );
}
