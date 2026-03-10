import type { Subprocess } from "bun";

export interface TerminalInfo {
  id: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
}

interface TerminalSession {
  id: string;
  proc: Subprocess;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  onData: (data: string) => void;
  onExit: (code: number) => void;
  onPortDetected: (port: number, url: string) => void;
  // 输出缓冲（16ms flush，复用 ws.ts 的 delta 合并模式）
  outputBuffer: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_TERMINALS = 5;
const OUTPUT_FLUSH_INTERVAL = 16; // ms

// 匹配终端输出中的 localhost URL
const PORT_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/g,
  /(?:on|at|listening)\s+(?:port\s+)?(\d{4,5})/gi,
];

function detectPorts(text: string): Array<{ port: number; url: string }> {
  const results: Array<{ port: number; url: string }> = [];
  const seen = new Set<number>();

  for (const pattern of PORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port <= 65535 && !seen.has(port)) {
        seen.add(port);
        results.push({
          port,
          url: `http://localhost:${port}`,
        });
      }
    }
  }

  return results;
}

export class TerminalManager {
  private terminals = new Map<string, TerminalSession>();
  private detectedPorts = new Set<string>(); // "terminalId:port" 去重

  create(
    id: string,
    options: {
      cwd?: string;
      shell?: string;
      cols?: number;
      rows?: number;
      onData: (data: string) => void;
      onExit: (code: number) => void;
      onPortDetected: (port: number, url: string) => void;
    }
  ): TerminalInfo {
    if (this.terminals.size >= MAX_TERMINALS) {
      throw new Error(`Maximum ${MAX_TERMINALS} terminals allowed`);
    }

    if (this.terminals.has(id)) {
      throw new Error(`Terminal ${id} already exists`);
    }

    const shell = options.shell || process.env.SHELL || "bash";
    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const session: TerminalSession = {
      id,
      proc: null as unknown as Subprocess,
      shell,
      cwd,
      cols,
      rows,
      createdAt: Date.now(),
      onData: options.onData,
      onExit: options.onExit,
      onPortDetected: options.onPortDetected,
      outputBuffer: "",
      flushTimer: null,
    };

    const proc = Bun.spawn([shell], {
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
      terminal: {
        cols,
        rows,
        data: (_terminal: unknown, data: Buffer | Uint8Array) => {
          const text = typeof data === "string" ? data : Buffer.from(data).toString("utf-8");

          // 端口检测
          const ports = detectPorts(text);
          for (const { port, url } of ports) {
            const key = `${id}:${port}`;
            if (!this.detectedPorts.has(key)) {
              this.detectedPorts.add(key);
              session.onPortDetected(port, url);
            }
          }

          // 缓冲输出，16ms 后批量发送
          session.outputBuffer += text;
          if (!session.flushTimer) {
            session.flushTimer = setTimeout(() => {
              if (session.outputBuffer) {
                session.onData(session.outputBuffer);
                session.outputBuffer = "";
              }
              session.flushTimer = null;
            }, OUTPUT_FLUSH_INTERVAL);
          }
        },
      },
    });

    session.proc = proc;
    this.terminals.set(id, session);

    // 监听进程退出
    proc.exited.then((code) => {
      // Flush 剩余输出
      if (session.flushTimer) {
        clearTimeout(session.flushTimer);
        session.flushTimer = null;
      }
      if (session.outputBuffer) {
        session.onData(session.outputBuffer);
        session.outputBuffer = "";
      }

      session.onExit(code ?? 0);
      this.terminals.delete(id);
      // 清理该终端的端口检测记录
      for (const key of this.detectedPorts) {
        if (key.startsWith(`${id}:`)) {
          this.detectedPorts.delete(key);
        }
      }
    });

    return { id, shell, cwd, cols, rows, createdAt: session.createdAt };
  }

  write(id: string, data: string): void {
    const session = this.terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    (session.proc as unknown as { terminal: { write(data: string): void } }).terminal.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    session.cols = cols;
    session.rows = rows;
    (session.proc as unknown as { terminal: { resize(cols: number, rows: number): void } }).terminal.resize(cols, rows);
  }

  destroy(id: string): void {
    const session = this.terminals.get(id);
    if (!session) return;

    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    session.proc.kill();
    this.terminals.delete(id);

    for (const key of this.detectedPorts) {
      if (key.startsWith(`${id}:`)) {
        this.detectedPorts.delete(key);
      }
    }
  }

  destroyAll(): void {
    for (const id of [...this.terminals.keys()]) {
      this.destroy(id);
    }
  }

  list(): TerminalInfo[] {
    return [...this.terminals.values()].map(({ id, shell, cwd, cols, rows, createdAt }) => ({
      id,
      shell,
      cwd,
      cols,
      rows,
      createdAt,
    }));
  }

  has(id: string): boolean {
    return this.terminals.has(id);
  }
}
