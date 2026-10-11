import { useCallback, useState } from "react";
import { DEFAULT_SETTINGS, LEGACY_STORAGE_KEY, parseStoredSettings, STORAGE_KEY, type Settings } from "./settings";

function load(): Settings {
  try {
    return parseStoredSettings(localStorage.getItem(STORAGE_KEY), localStorage.getItem(LEGACY_STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Picked once and remembered in this browser; storage being unavailable only costs the memory.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { settings, update };
}
