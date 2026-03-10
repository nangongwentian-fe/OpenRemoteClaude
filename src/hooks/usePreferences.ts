import { useState, useCallback } from "react";
import type { SessionPreferences } from "../types/messages";

const STORAGE_KEY = "rcc_preferences";

const defaults: SessionPreferences = {
  effort: "high",
  thinking: "adaptive",
  permissionMode: "acceptEdits",
};

function loadPreferences(): SessionPreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch {
    return defaults;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<SessionPreferences>(loadPreferences);

  const updatePreference = useCallback(
    <K extends keyof SessionPreferences>(key: K, value: SessionPreferences[K]) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  return { preferences, updatePreference };
}
