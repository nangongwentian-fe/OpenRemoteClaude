import { useState, useCallback, useRef } from "react";

interface Options {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: "left" | "right";
}

export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
}: Options) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved
      ? Math.max(minWidth, Math.min(maxWidth, Number(saved)))
      : defaultWidth;
  });

  const widthRef = useRef(width);
  widthRef.current = width;

  const minRef = useRef(minWidth);
  minRef.current = minWidth;
  const maxRef = useRef(maxWidth);
  maxRef.current = maxWidth;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (e: MouseEvent) => {
        const delta =
          side === "left" ? e.clientX - startX : startX - e.clientX;
        const newWidth = Math.max(
          minRef.current,
          Math.min(maxRef.current, startWidth + delta)
        );
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        localStorage.setItem(storageKey, String(widthRef.current));
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [side, storageKey]
  );

  return { width, setWidth, handleMouseDown };
}
