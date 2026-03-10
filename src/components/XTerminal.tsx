import { useRef, useEffect, useImperativeHandle, forwardRef, useMemo, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export interface XTerminalHandle {
  write: (data: string) => void;
  focus: () => void;
}

interface Props {
  isActive: boolean;
  isPanelVisible: boolean;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  className?: string;
}

const LIGHT_THEME = {
  background: "#faf9f5",
  foreground: "#1a1915",
  cursor: "#d97757",
  cursorAccent: "#faf9f5",
  selectionBackground: "rgba(217, 119, 87, 0.25)",
  black: "#1a1915",
  red: "#dc3545",
  green: "#788c5d",
  yellow: "#c49a2a",
  blue: "#5b7ba0",
  magenta: "#9b6b8a",
  cyan: "#5e8d87",
  white: "#e8e6dc",
  brightBlack: "#78756a",
  brightRed: "#ef4444",
  brightGreen: "#8ea870",
  brightYellow: "#d4a843",
  brightBlue: "#6e8eb5",
  brightMagenta: "#b07da0",
  brightCyan: "#72a09a",
  brightWhite: "#faf9f5",
};

const DARK_THEME = {
  background: "#1a1915",
  foreground: "#e8e6dc",
  cursor: "#d97757",
  cursorAccent: "#1a1915",
  selectionBackground: "rgba(217, 119, 87, 0.3)",
  black: "#1a1915",
  red: "#ef4444",
  green: "#788c5d",
  yellow: "#d4a843",
  blue: "#6e8eb5",
  magenta: "#b07da0",
  cyan: "#72a09a",
  white: "#e8e6dc",
  brightBlack: "#b0aea5",
  brightRed: "#f87171",
  brightGreen: "#8ea870",
  brightYellow: "#e0b84d",
  brightBlue: "#8da5c5",
  brightMagenta: "#c494b5",
  brightCyan: "#8ab5ae",
  brightWhite: "#faf9f5",
};

export const XTerminal = forwardRef<XTerminalHandle, Props>(
  ({ isActive, isPanelVisible, onData, onResize, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    const isDark = useMemo(() => {
      return document.documentElement.classList.contains("dark");
    }, []);

    const safeFit = useCallback(() => {
      const container = containerRef.current;
      const fitAddon = fitAddonRef.current;
      if (!container || !fitAddon) return;
      if (container.offsetParent === null) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;

      try {
        fitAddon.fit();
      } catch {
        // 容器尺寸不可用时忽略 fit 异常，等待下一次可见再重试
      }
    }, []);

    // 初始化 Terminal
    useEffect(() => {
      if (!containerRef.current) return;

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
        theme: isDark ? DARK_THEME : LIGHT_THEME,
        allowProposedApi: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(containerRef.current);

      // 首次 fit
      requestAnimationFrame(safeFit);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // 用户输入 → WebSocket
      const dataDisposable = terminal.onData(onData);
      const resizeDisposable = terminal.onResize(({ cols, rows }) => {
        onResize(cols, rows);
      });

      // 容器尺寸变化 → fit
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(safeFit);
      });
      observer.observe(containerRef.current);

      return () => {
        dataDisposable.dispose();
        resizeDisposable.dispose();
        observer.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, [isDark, safeFit]); // eslint-disable-line react-hooks/exhaustive-deps

    // 主题变化
    useEffect(() => {
      const observer = new MutationObserver(() => {
        const dark = document.documentElement.classList.contains("dark");
        terminalRef.current?.options.theme;
        terminalRef.current?.options && (terminalRef.current.options.theme = dark ? DARK_THEME : LIGHT_THEME);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    }, []);

    // active 时 fit + focus
    useEffect(() => {
      if (isActive && isPanelVisible && terminalRef.current) {
        requestAnimationFrame(() => {
          safeFit();
          terminalRef.current?.focus();
        });
      }
    }, [isActive, isPanelVisible, safeFit]);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        terminalRef.current?.write(data);
      },
      focus: () => {
        terminalRef.current?.focus();
      },
    }));

    return (
      <div
        ref={containerRef}
        className={`h-full w-full ${className || ""}`}
        style={{ display: isActive ? "block" : "none" }}
      />
    );
  }
);

XTerminal.displayName = "XTerminal";
