import { useCallback, useEffect, useState } from "react";

export interface Problem {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  type: string;
  statement: string;
}

export function useNextProblem(subject: string) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/problems/next?subject=${subject}`);
      if (!res.ok) throw new Error(`bridge returned ${res.status}`);
      setProblem((await res.json()) as Problem);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load problem");
    }
  }, [subject]);

  useEffect(() => {
    void load();
  }, [load]);

  return { problem, error, next: load };
}
