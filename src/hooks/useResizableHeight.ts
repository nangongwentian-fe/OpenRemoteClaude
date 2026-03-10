import { useState, useCallback, useRef } from "react";

interface Options {
  storageKey: string;
  defaultHeight: number;
  minHeight: number;
  maxHeight: number;
}

export function useResizableHeight({
  storageKey,
  defaultHeight,
  minHeight,
  maxHeight,
}: Options) {
  const [height, setHeight] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved
      ? Math.max(minHeight, Math.min(maxHeight, Number(saved)))
      : defaultHeight;
  });

  const heightRef = useRef(height);
  heightRef.current = height;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const startHeight = heightRef.current;

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        // 向上拖 = clientY 减小 = 高度增大
        const delta = startY - clientY;
        const newHeight = Math.max(
          minHeight,
          Math.min(maxHeight, startHeight + delta)
        );
        setHeight(newHeight);
      };

      const handleEnd = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleEnd);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
        localStorage.setItem(storageKey, String(heightRef.current));
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleMove);
      document.addEventListener("touchend", handleEnd);
    },
    [minHeight, maxHeight, storageKey]
  );

  return { height, handleMouseDown };
}
