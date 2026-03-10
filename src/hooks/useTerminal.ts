import { useState, useCallback, useRef } from "react";
import type { ClientMessage, TerminalListItem } from "../types/messages";

interface TerminalState {
  id: string;
  shell: string;
  cwd: string;
}

interface PendingCreateOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
}

type SendFn = (msg: ClientMessage) => void;
type OutputCallback = (id: string, data: string) => void;

export function useTerminal(sendRaw: SendFn) {
  const [terminals, setTerminals] = useState<Map<string, TerminalState>>(new Map());
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalPanelVisible, setTerminalPanelVisible] = useState(false);
  const outputCallbackRef = useRef<OutputCallback | null>(null);
  const pendingCreateOnListRef = useRef<PendingCreateOptions | null>(null);

  const registerOutputCallback = useCallback((cb: OutputCallback) => {
    outputCallbackRef.current = cb;
  }, []);

  const createTerminal = useCallback(
    (cwd?: string, cols?: number, rows?: number) => {
      const id = crypto.randomUUID();
      sendRaw({
        type: "terminal_create",
        payload: { id, cwd, cols, rows },
      });
      return id;
    },
    [sendRaw]
  );

  const sendInput = useCallback(
    (id: string, data: string) => {
      sendRaw({
        type: "terminal_input",
        payload: { id, data },
      });
    },
    [sendRaw]
  );

  const resizeTerminal = useCallback(
    (id: string, cols: number, rows: number) => {
      sendRaw({
        type: "terminal_resize",
        payload: { id, cols, rows },
      });
    },
    [sendRaw]
  );

  const destroyTerminal = useCallback(
    (id: string) => {
      sendRaw({
        type: "terminal_destroy",
        payload: { id },
      });
      setTerminals((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setActiveTerminalId((prev) => (prev === id ? null : prev));
    },
    [sendRaw]
  );

  const requestTerminalList = useCallback(() => {
    sendRaw({ type: "terminal_list" });
  }, [sendRaw]);

  const openTerminalPanel = useCallback(
    (cwd?: string, cols?: number, rows?: number) => {
      setTerminalPanelVisible(true);
      pendingCreateOnListRef.current = terminals.size === 0 ? { cwd, cols, rows } : null;
      requestTerminalList();
    },
    [requestTerminalList, terminals.size]
  );

  const closeTerminalPanel = useCallback(() => {
    pendingCreateOnListRef.current = null;
    setTerminalPanelVisible(false);
  }, []);

  const handleServerMessage = useCallback(
    (msg: { type: string; payload?: Record<string, unknown> }) => {
      switch (msg.type) {
        case "terminal_created": {
          const p = msg.payload as { id: string; shell: string; cwd: string };
          setTerminals((prev) => {
            const next = new Map(prev);
            next.set(p.id, { id: p.id, shell: p.shell, cwd: p.cwd });
            return next;
          });
          setActiveTerminalId(p.id);
          setTerminalPanelVisible(true);
          break;
        }
        case "terminal_output": {
          const p = msg.payload as { id: string; data: string };
          outputCallbackRef.current?.(p.id, p.data);
          break;
        }
        case "terminal_exited": {
          const p = msg.payload as { id: string; exitCode: number };
          setTerminals((prev) => {
            const next = new Map(prev);
            next.delete(p.id);
            return next;
          });
          setActiveTerminalId((prev) => (prev === p.id ? null : prev));
          break;
        }
        case "terminal_list": {
          const p = msg.payload as { terminals: TerminalListItem[] };
          const map = new Map<string, TerminalState>();
          for (const t of p.terminals) {
            map.set(t.id, { id: t.id, shell: t.shell, cwd: t.cwd });
          }
          setTerminals(map);
          setActiveTerminalId((prev) => {
            if (prev && map.has(prev)) return prev;
            return map.keys().next().value ?? null;
          });

          if (pendingCreateOnListRef.current) {
            if (map.size === 0) {
              const pending = pendingCreateOnListRef.current;
              pendingCreateOnListRef.current = null;
              createTerminal(pending.cwd, pending.cols, pending.rows);
            } else {
              pendingCreateOnListRef.current = null;
            }
          }
          break;
        }
      }
    },
    [createTerminal]
  );

  return {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    terminalPanelVisible,
    setTerminalPanelVisible,
    openTerminalPanel,
    closeTerminalPanel,
    createTerminal,
    sendInput,
    resizeTerminal,
    destroyTerminal,
    requestTerminalList,
    handleServerMessage,
    registerOutputCallback,
  };
}
