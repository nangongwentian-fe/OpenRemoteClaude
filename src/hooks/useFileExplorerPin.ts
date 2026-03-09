import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "rcc_file_explorer_pinned";

export function useFileExplorerPin() {
  const [isPinned, setIsPinned] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const isEffectivelyPinned = isPinned && isDesktop;

  return { isPinned, isDesktop, isEffectivelyPinned, togglePin };
}
