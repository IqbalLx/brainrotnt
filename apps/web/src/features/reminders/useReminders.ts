import { useCallback, useEffect, useState } from "react";
import type { AgentState } from "../agent-state/useAgentState";
import { activeReminder, dismiss, initialReminders, snooze, type ReminderKey, type ReminderState, type RunOffer } from "./reminders";

export function useReminders(status: AgentState, since: string | null, finishedAt: string | null, sessionOpen: boolean, run: RunOffer) {
  const [state, setState] = useState<ReminderState>(initialReminders);
  const [now, setNow] = useState(() => Date.now());

  // Wake up when a snooze runs out, so the reminder comes back without any other event.
  useEffect(() => {
    if (!state.snoozed) return;
    const wait = state.snoozed.until - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), wait + 50);
    return () => clearTimeout(timer);
  }, [state.snoozed]);

  const reminder = activeReminder(status, since, finishedAt, sessionOpen, state, Math.max(now, Date.now()), run);

  return {
    reminder,
    snooze: useCallback((key: ReminderKey, ms: number) => {
      const at = Date.now();
      setNow(at);
      setState((current) => snooze(current, key, ms, at));
    }, []),
    dismiss: useCallback((key: ReminderKey) => setState((current) => dismiss(current, key)), []),
  };
}
