import { useEffect, useRef } from "react";
import { BankPage } from "@/features/bank/BankPage";
import { useAgentState } from "@/features/agent-state/useAgentState";
import { ReminderCard } from "@/features/reminders/ReminderCard";
import { useReminders } from "@/features/reminders/useReminders";
import { ReviewPage } from "@/features/review/ReviewPage";
import { useRunTimer } from "@/features/run-timer/useRunTimer";
import { SessionPanel } from "@/features/session/SessionPanel";
import { useSession } from "@/features/session/useSession";
import { useSettings } from "@/features/settings/useSettings";
import { AgentPill } from "@/features/shell/AgentPill";
import { Nav } from "@/features/shell/Nav";
import { StatusFooter } from "@/features/shell/StatusFooter";
import { useHealth } from "@/features/shell/useHealth";
import { useRoute } from "@/features/shell/useRoute";

export default function App() {
  const { event, status, since, finishedAt, finish, runStartedAt, connected, acknowledgeFinish } = useAgentState();
  const { settings, update } = useSettings();
  const session = useSession(status);
  const timer = useRunTimer(status);
  // A new run offers a session rather than starting one, unless one is already open or a score screen
  // is being read: the agent's first output, or a short planning run, may matter more right then.
  const canStart = session.phase === "none" || session.phase === "empty";
  const reminders = useReminders(status, since, finishedAt, session.open, { startedAt: runStartedAt, canStart });
  const health = useHealth();

  // A finish stands for every agent until the session it reminded about ends (see nextFinish).
  const wasOpen = useRef(session.open);
  useEffect(() => {
    if (wasOpen.current && !session.open) acknowledgeFinish();
    wasOpen.current = session.open;
  }, [session.open, acknowledgeFinish]);
  const { route, navigate } = useRoute();

  // When a session ends, its review opens.
  const endedId = session.phase === "ended" ? session.score?.id : undefined;
  useEffect(() => {
    if (endedId) navigate({ page: "review", sessionId: endedId });
  }, [endedId, navigate]);

  const startFromAnywhere = (startedBy: "agent" | "manual" = "manual") => {
    navigate({ page: "exercise" });
    void session.start(settings, startedBy);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0 md:px-8">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-info" aria-hidden />
            <h1 className="text-code-lg font-semibold text-ink">brainrotnt</h1>
          </div>
          {/* On a phone the nav takes its own row under the logo and the agent pill. */}
          <div className="order-last w-full sm:order-none sm:mr-auto sm:w-auto">
            <Nav current={route.page} />
          </div>
          <AgentPill status={status} event={event} runMs={timer.elapsedMs} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
        {reminders.reminder && (
          <ReminderCard
            reminder={reminders.reminder}
            event={reminders.reminder.kind === "done" ? (finish ?? event) : event}
            onAct={() => {
              const reminder = reminders.reminder!;
              reminders.dismiss(reminder);
              if (reminder.kind === "done") void session.end();
              // "agent": it never replaces a session opened meanwhile in another tab.
              if (reminder.kind === "working") startFromAnywhere("agent");
            }}
            onSnooze={(ms) => reminders.snooze(reminders.reminder!, ms)}
            onDismiss={reminders.reminder.kind === "working" ? () => reminders.dismiss(reminders.reminder!) : undefined}
          />
        )}
        {route.page === "review" ? (
          <ReviewPage sessionId={route.sessionId} refresh={endedId} onStartAnother={() => startFromAnywhere()} />
        ) : route.page === "bank" ? (
          <BankPage settings={settings} onSettings={update} />
        ) : (
          <SessionPanel
            session={session}
            settings={settings}
            agentWorking={status === "working"}
            onStart={() => void session.start(settings, "manual")}
          />
        )}
      </main>

      <StatusFooter health={health} streamConnected={connected} event={event} />
    </div>
  );
}
