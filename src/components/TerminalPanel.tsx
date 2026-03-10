import { useRef, useEffect, useCallback } from "react";
import { Terminal as TerminalIcon, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { XTerminal, type XTerminalHandle } from "./XTerminal";

interface TerminalState {
  id: string;
  shell: string;
  cwd: string;
}

interface Props {
  visible: boolean;
  terminals: Map<string, TerminalState>;
  activeTerminalId: string | null;
  onSetActive: (id: string) => void;
  onCreateTerminal: () => void;
  onDestroyTerminal: (id: string) => void;
  onInput: (id: string, data: string) => void;
  onResize: (id: string, cols: number, rows: number) => void;
  height: number;
  onResizeHandle: (e: React.MouseEvent | React.TouchEvent) => void;
  registerOutputCallback: (cb: (id: string, data: string) => void) => void;
}

export function TerminalPanel({
  visible,
  terminals,
  activeTerminalId,
  onSetActive,
  onCreateTerminal,
  onDestroyTerminal,
  onInput,
  onResize,
  height,
  onResizeHandle,
  registerOutputCallback,
}: Props) {
  const terminalRefs = useRef<Map<string, XTerminalHandle>>(new Map());

  // 注册 output callback：直接写入 xterm 实例，绕过 React state
  useEffect(() => {
    registerOutputCallback((id: string, data: string) => {
      terminalRefs.current.get(id)?.write(data);
    });
  }, [registerOutputCallback]);

  const setRef = useCallback(
    (id: string) => (handle: XTerminalHandle | null) => {
      if (handle) {
        terminalRefs.current.set(id, handle);
      } else {
        terminalRefs.current.delete(id);
      }
    },
    []
  );

  const terminalEntries = [...terminals.entries()];
  const isMobileFullscreen = height === -1;

  return (
    <div
      className={`flex flex-col border-t border-(--color-overlay-border) bg-card/50 ${isMobileFullscreen ? "h-full" : ""} ${visible ? "" : "hidden"}`}
      style={isMobileFullscreen ? undefined : { height }}
    >
      {/* 拖拽手柄（移动端全屏不显示） */}
      {!isMobileFullscreen && (
        <div
          className="h-1.5 cursor-row-resize bg-(--color-overlay) hover:bg-primary/30 transition-colors shrink-0 flex items-center justify-center"
          onMouseDown={onResizeHandle}
          onTouchStart={onResizeHandle}
        >
          <div className="w-8 h-0.5 rounded-full bg-(--color-overlay-border)" />
        </div>
      )}

      {/* Tab 栏 */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-(--color-overlay-border) shrink-0 overflow-x-auto">
        {terminalEntries.map(([id, term]) => {
          const isActive = id === activeTerminalId;
          const shellName = term.shell.split(/[\\/]/).pop() || "sh";
          return (
            <button
              key={id}
              onClick={() => onSetActive(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? "bg-(--color-overlay-hover) text-foreground"
                  : "text-muted-foreground hover:bg-(--color-overlay) hover:text-foreground"
              }`}
            >
              <TerminalIcon className="size-3" />
              <span>{shellName}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDestroyTerminal(id);
                }}
                className="ml-1 rounded hover:bg-(--color-overlay-hover) p-0.5 cursor-pointer"
              >
                <X className="size-2.5" />
              </span>
            </button>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded-md hover:bg-(--color-overlay-hover) shrink-0"
          onClick={onCreateTerminal}
          title="New Terminal"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* Terminal 渲染区域 */}
      <div className="flex-1 min-h-0 relative">
        {terminalEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <button
              onClick={onCreateTerminal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-(--color-overlay-border) hover:bg-(--color-overlay-hover) transition-colors cursor-pointer"
            >
              <Plus className="size-4" />
              Create Terminal
            </button>
          </div>
        ) : (
          terminalEntries.map(([id]) => (
            <XTerminal
              key={id}
              ref={setRef(id)}
              isActive={id === activeTerminalId}
              isPanelVisible={visible}
              onData={(data) => onInput(id, data)}
              onResize={(cols, rows) => onResize(id, cols, rows)}
              className="p-1"
            />
          ))
        )}
      </div>
    </div>
  );
}
