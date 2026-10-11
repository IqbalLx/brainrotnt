import { useEffect, useState } from "react";

export interface Health {
  online: boolean;
  sandbox: "strict" | "unsandboxed-allowed" | "unavailable" | null;
}

// Polls the bridge's health so the status bar can say whether it is reachable and how it runs code.
export function useHealth(intervalMs = 30_000): Health {
  const [health, setHealth] = useState<Health>({ online: true, sandbox: null });
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch("/api/health")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((body: { sandbox?: Health["sandbox"] }) => !cancelled && setHealth({ online: true, sandbox: body.sandbox ?? null }))
        .catch(() => !cancelled && setHealth((current) => ({ ...current, online: false })));
    void check();
    const timer = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return health;
}
