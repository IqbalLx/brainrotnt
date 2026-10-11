import { useCallback, useEffect, useState } from "react";

export type Route = { page: "exercise" } | { page: "review"; sessionId: string | null };

// Hash routes keep the app a single static page: #/ is practice, #/review[/<session id>] the review.
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "review") return { page: "review", sessionId: parts[1] ?? null };
  return { page: "exercise" };
}

export function hrefFor(route: Route): string {
  if (route.page === "review") return route.sessionId ? `#/review/${route.sessionId}` : "#/review";
  return "#/";
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Route) => {
    window.location.hash = hrefFor(next);
  }, []);
  return { route, navigate };
}
