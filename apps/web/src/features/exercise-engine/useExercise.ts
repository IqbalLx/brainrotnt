import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentState } from "@/features/agent-state/useAgentState";

export interface Problem {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  type: "mcq" | "numeric" | "symbolic";
  statement: string;
  choices: string[] | null;
  unit: string | null;
  variables: string[] | null;
  tools: { calculator: "none" | "basic" | "scientific" | "stats"; draw: boolean };
}

export interface AttemptResult {
  correct: boolean;
  expected: string;
}

export type Phase = "loading" | "answering" | "submitting" | "result" | "empty" | "error";

export function useExercise(subject: string, difficulty: { min: number; max: number }, agentState: AgentState) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  const seen = useRef<string[]>([]);
  const latestLoad = useRef(0);
  const startedAt = useRef(0);
  const agentAtStart = useRef<AgentState>(agentState);
  const latestAgentState = useRef(agentState);
  latestAgentState.current = agentState;

  const fetchProblem = useCallback(
    async (exclude: string[]) => {
      const params = new URLSearchParams({ subject, minDifficulty: String(difficulty.min), maxDifficulty: String(difficulty.max) });
      if (exclude.length > 0) params.set("exclude", exclude.join(","));
      return fetch(`/api/problems/next?${params}`);
    },
    [subject, difficulty.min, difficulty.max],
  );

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    setPhase("loading");
    setResult(null);
    setMessage(null);
    setFlagged(false);
    try {
      let res = await fetchProblem(seen.current);
      // Everything in this subject has been seen this session: start over.
      if (res.status === 404 && seen.current.length > 0) {
        seen.current = [];
        res = await fetchProblem([]);
      }
      if (loadId !== latestLoad.current) return;
      if (res.status === 404) {
        setProblem(null);
        setPhase("empty");
        return;
      }
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);

      const next = (await res.json()) as Problem;
      if (loadId !== latestLoad.current) return;
      seen.current = [...seen.current, next.id];
      startedAt.current = performance.now();
      agentAtStart.current = latestAgentState.current;
      setProblem(next);
      setPhase("answering");
    } catch (e) {
      if (loadId !== latestLoad.current) return;
      setMessage(e instanceof Error ? e.message : "failed to load problem");
      setPhase("error");
    }
  }, [fetchProblem]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (answer: string | number, toolsUsed: string[] = []) => {
      if (!problem) return;
      setPhase("submitting");
      setMessage(null);
      try {
        const res = await fetch("/api/attempts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            problemId: problem.id,
            answer,
            secondsSpent: Math.round(((performance.now() - startedAt.current) / 1000) * 10) / 10,
            agentState: agentAtStart.current,
            toolsUsed,
          }),
        });
        const body = await res.json();
        if (res.status === 422 && body.error === "invalid_answer") {
          setMessage(body.message);
          setPhase("answering");
          return;
        }
        if (!res.ok) throw new Error(`bridge returned ${res.status}`);
        setResult({ correct: body.correct, expected: body.expected });
        setPhase("result");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "failed to submit answer");
        setPhase("answering");
      }
    },
    [problem],
  );

  const flag = useCallback(async () => {
    if (!problem || flagged) return;
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problemId: problem.id }),
      });
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      setFlagged(true);
    } catch {
      setMessage("Could not flag this problem.");
    }
  }, [problem, flagged]);

  return { problem, phase, result, message, flagged, submit, flag, next: load };
}
