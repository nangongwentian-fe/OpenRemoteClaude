import { useState, useEffect, useRef, useCallback } from "react";
import { AtSign } from "lucide-react";

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  filePath: string;
  fileName: string;
  onAddReference: (startLine: number, endLine: number, content: string) => void;
}

export function CodeSelectionPopover({
  containerRef,
  filePath,
  fileName,
  onAddReference,
}: Props) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{
    startLine: number;
    endLine: number;
    content: string;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const getLineNumber = useCallback((node: Node): number | null => {
    let el = node instanceof Element ? node : node.parentElement;
    while (el && el !== containerRef.current) {
      const line = el.getAttribute("data-line");
      if (line) return parseInt(line, 10);
      el = el.parentElement;
    }
    return null;
  }, [containerRef]);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setPosition(null);
      setSelectionInfo(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setPosition(null);
      setSelectionInfo(null);
      return;
    }

    const content = selection.toString().trim();
    if (!content) {
      setPosition(null);
      setSelectionInfo(null);
      return;
    }

    const startLine = getLineNumber(range.startContainer);
    const endLine = getLineNumber(range.endContainer);
    if (startLine === null || endLine === null) {
      setPosition(null);
      setSelectionInfo(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setPosition({
      top: rect.top - containerRect.top - 32,
      left: Math.min(rect.left - containerRect.left + rect.width / 2, containerRect.width - 40),
    });
    setSelectionInfo({
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      content,
    });
  }, [containerRef, getLineNumber]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPosition(null);
        setSelectionInfo(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!position || !selectionInfo) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.top, left: position.left, transform: "translateX(-50%)" }}
    >
      <button
        onClick={() => {
          onAddReference(selectionInfo.startLine, selectionInfo.endLine, selectionInfo.content);
          window.getSelection()?.removeAllRanges();
          setPosition(null);
          setSelectionInfo(null);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-(--color-overlay-border) shadow-lg text-xs font-medium text-foreground hover:bg-(--color-overlay-hover) transition-colors cursor-pointer"
      >
        <AtSign className="size-3.5 text-primary" />
        <span>Reference L{selectionInfo.startLine}-{selectionInfo.endLine}</span>
      </button>
    </div>
  );
}
