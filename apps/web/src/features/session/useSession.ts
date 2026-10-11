import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentState } from "../agent-state/useAgentState";
import type { CodeSubmission, TrialOutcome } from "../code-editor/languages";
import type { AttemptResult, Problem } from "../exercise-engine/types";
import type { Settings } from "../settings/settings";

export interface SessionItem {
  position: number;
  outcome: "answered" | "skipped" | null;
  credit: number | null;
}

export interface SessionView {
  id: string;
  subjects: string[];
  size: number;
  startedBy: "agent" | "manual";
  startedAt: string;
  endedAt: string | null;
  endReason: "completed" | "ended_early" | "abandoned" | null;
  position: number | null;
  items: SessionItem[];
  current: (Problem & { hintsRevealed: number; hintCount: number; hints: string[] }) | null;
}

export interface SessionScore {
  id: string;
  endReason: SessionView["endReason"];
  score: number;
  /** One point per question answered or skipped; questions never reached are not counted. */
  maxScore: number;
  answered: number;
  skipped: number;
  unanswered: number;
  correct: number;
  startedAt: string;
  endedAt: string;
  subjects: string[];
  secondsSpent: number;
  hintsUsed: number;
  items: {
    position: number;
    problemId: string;
    subject: string;
    topic: string;
    statement: string;
    outcome: "answered" | "skipped" | "unanswered";
    correct: boolean | null;
    credit: number;
    hintsUsed: number;
    explanation: string | null;
    hasExplanation: boolean;
    type: string;
    secondsSpent: number | null;
    answerGiven: unknown;
  }[];
}

export type SessionPhase =
  | "loading" // looking for an open session
  | "none" // no session: offer to start one
  | "starting"
  | "empty" // nothing matched the settings
  | "answering"
  | "submitting"
  | "result"
  | "ended" // score screen
  | "error";

export type SessionResult = AttemptResult & { credit: number };

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export function useSession(agentState: AgentState) {
  const [view, setView] = useState<SessionView | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [score, setScore] = useState<SessionScore | null>(null);

  // The session as it stands after the answer being shown; it becomes current on "Next".
  const pending = useRef<SessionView | null>(null);
  const questionStartedAt = useRef(0);
  const agentAtQuestion = useRef<AgentState>(agentState);
  const latestAgent = useRef(agentState);
  latestAgent.current = agentState;

  const showQuestion = useCallback(async (next: SessionView) => {
    setView(next);
    setResult(null);
    setMessage(null);
    setFlagged(false);
    if (next.current) {
      questionStartedAt.current = performance.now();
      agentAtQuestion.current = latestAgent.current;
      setPhase("answering");
      return;
    }
    setPhase("loading");
    const res = await fetch(`/api/sessions/${next.id}/score`);
    if (!res.ok) {
      setMessage(`bridge returned ${res.status}`);
      setPhase("error");
      return;
    }
    setScore((await res.json()) as SessionScore);
    setPhase("ended");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions/current")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setPhase("none");
        if (!res.ok) throw new Error(`bridge returned ${res.status}`);
        await showQuestion((await res.json()) as SessionView);
      })
      .catch((e) => {
        if (cancelled) return;
        setMessage(e instanceof Error ? e.message : "failed to reach the bridge");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [showQuestion]);

  const start = useCallback(
    async (settings: Settings, startedBy: "agent" | "manual") => {
      setPhase("starting");
      setScore(null);
      setMessage(null);
      try {
        const res = await post("/api/sessions", {
          subjects: settings.subjects,
          minDifficulty: settings.minDifficulty,
          maxDifficulty: settings.maxDifficulty,
          size: settings.sessionSize,
          startedBy,
        });
        if (res.status === 404) {
          setView(null);
          setPhase("empty");
          return;
        }
        if (!res.ok) throw new Error(`bridge returned ${res.status}`);
        await showQuestion((await res.json()) as SessionView);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "failed to start a session");
        setPhase("error");
      }
    },
    [showQuestion],
  );

  const submit = useCallback(
    async (answer: string | number | CodeSubmission, toolsUsed: string[] = []) => {
      if (!view || view.position === null) return;
      setPhase("submitting");
      setMessage(null);
      try {
        const res = await post(`/api/sessions/${view.id}/answer`, {
          position: view.position,
          answer,
          secondsSpent: Math.round(((performance.now() - questionStartedAt.current) / 1000) * 10) / 10,
          agentState: agentAtQuestion.current,
          toolsUsed,
        });
        const body = await res.json();
        if (res.status === 422 && body.error === "invalid_answer") {
          setMessage(body.message);
          setPhase("answering");
          return;
        }
        // The bridge explains some refusals, such as code answers from another device in network mode.
        if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : `bridge returned ${res.status}`);
        pending.current = body.session as SessionView;
        setResult({ correct: body.correct, expected: body.expected, detail: body.detail ?? null, credit: body.credit });
        setPhase("result");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "failed to submit answer");
        setPhase("answering");
      }
    },
    [view],
  );

  // Runs code against the disclosed tests of the current question. Nothing is recorded and the
  // question stays open, so the result is returned to the card rather than kept here.
  const tryCode = useCallback(
    async (submission: CodeSubmission): Promise<TrialOutcome> => {
      if (!view || view.position === null) return { status: "error", message: "There is no question to run." };
      try {
        const res = await post(`/api/sessions/${view.id}/try`, { position: view.position, answer: submission });
        const body = await res.json();
        if (res.ok && body.status === "ran") return body as TrialOutcome;
        if (typeof body.message === "string") return { status: "error", message: body.message };
        return { status: "error", message: `bridge returned ${res.status}` };
      } catch {
        return { status: "error", message: "Could not reach the bridge to run the tests." };
      }
    },
    [view],
  );

  const next = useCallback(async () => {
    if (pending.current) await showQuestion(pending.current);
    pending.current = null;
  }, [showQuestion]);

  const skip = useCallback(async () => {
    if (!view || view.position === null) return;
    setPhase("submitting");
    try {
      const res = await post(`/api/sessions/${view.id}/skip`, { position: view.position });
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      await showQuestion((await res.json()) as SessionView);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "failed to skip");
      setPhase("answering");
    }
  }, [view, showQuestion]);

  const end = useCallback(async () => {
    if (!view) return;
    try {
      const res = await post(`/api/sessions/${view.id}/end`);
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      pending.current = null;
      await showQuestion((await res.json()) as SessionView);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "failed to end the session");
    }
  }, [view, showQuestion]);

  const [revealing, setRevealing] = useState(false);
  const revealHint = useCallback(async () => {
    if (!view?.current || view.position === null || revealing) return;
    setRevealing(true);
    try {
      const res = await post(`/api/sessions/${view.id}/hints`, { position: view.position });
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      const body = (await res.json()) as { hints: string[]; hintsRevealed: number };
      setView((current) =>
        current?.current ? { ...current, current: { ...current.current, hints: body.hints, hintsRevealed: body.hintsRevealed } } : current,
      );
    } catch {
      setMessage("Could not open the hint.");
    } finally {
      setRevealing(false);
    }
  }, [view, revealing]);

  const flag = useCallback(async () => {
    const problem = view?.current;
    if (!problem || flagged) return;
    try {
      const res = await post("/api/flags", { problemId: problem.id });
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      setFlagged(true);
    } catch {
      setMessage("Could not flag this problem.");
    }
  }, [view, flagged]);

  // Open means there is still something to answer; the result of the last answer counts as open
  // until "Next", so a Done reminder can still offer to end it.
  const open = view !== null && view.endedAt === null && !(phase === "result" && pending.current?.endedAt);

  return { view, phase, result, message, flagged, score, open, revealing, start, submit, tryCode, next, skip, end, flag, revealHint };
}
