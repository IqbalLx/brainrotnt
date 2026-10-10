import { useEffect, useState } from "react";
import { resolveScheme, type Scheme } from "./colorScheme";

export function useColorScheme(): Scheme {
  const read = () => resolveScheme(document.documentElement.dataset.theme, window.matchMedia("(prefers-color-scheme: light)").matches);
  const [scheme, setScheme] = useState<Scheme>(read);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setScheme(read());
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return scheme;
}
