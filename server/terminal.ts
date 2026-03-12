export interface TerminalInfo {
  id: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
}

interface TerminalCreateOptions {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  onData: (data: string) => void;
  onExit: (code: number) => void;
  onPortDetected: (port: number, url: string) => void;
}

interface TerminalProcessAdapter {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

interface SpawnResult {
  shell: string;
  proc: TerminalProcessAdapter;
}

interface TerminalSession {
  id: string;
  proc: TerminalProcessAdapter;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  onData: (data: string) => void;
  onExit: (code: number) => void;
  onPortDetected: (port: number, url: string) => void;
  outputBuffer: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
  windowsPipeInputBuffer: string[];
}

const MAX_TERMINALS = 5;
const OUTPUT_FLUSH_INTERVAL = 16;

const PORT_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/g,
  /(?:on|at|listening)\s+(?:port\s+)?(\d{4,5})/gi,
];

function detectPorts(text: string): Array<{ port: number; url: string }> {
  const results: Array<{ port: number; url: string }> = [];
  const seen = new Set<number>();

  for (const pattern of PORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
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
  private detectedPorts = new Set<string>();

  create(id: string, options: TerminalCreateOptions): TerminalInfo {
    if (this.terminals.size >= MAX_TERMINALS) {
      throw new Error(`Maximum ${MAX_TERMINALS} terminals allowed`);
    }

    if (this.terminals.has(id)) {
      throw new Error(`Terminal ${id} already exists`);
    }

    const cwd = options.cwd || process.cwd();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const shell = options.shell || this.getDefaultShell();

    const session: TerminalSession = {
      id,
      proc: null as unknown as TerminalProcessAdapter,
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
      windowsPipeInputBuffer: [],
    };

    const spawned = this.spawnTerminal(session, options.shell);
    session.proc = spawned.proc;
    session.shell = spawned.shell;
    this.terminals.set(id, session);

    return {
      id,
      shell: session.shell,
      cwd,
      cols,
      rows,
      createdAt: session.createdAt,
    };
  }

  write(id: string, data: string): void {
    const session = this.terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    session.proc.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.terminals.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    session.cols = cols;
    session.rows = rows;
    session.proc.resize(cols, rows);
  }

  destroy(id: string): void {
    const session = this.terminals.get(id);
    if (!session) return;

    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    try {
      session.proc.kill();
    } catch {
      // Some backends can throw if the process is already closed.
    }
    this.terminals.delete(id);
    this.clearDetectedPorts(id);
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

  private getDefaultShell(): string {
    if (process.platform === "win32") {
      return this.getWindowsShellCandidates()[0] ?? "cmd.exe";
    }
    return process.env.SHELL || "bash";
  }

  private getWindowsShellCandidates(preferredShell?: string): string[] {
    if (preferredShell) return [preferredShell];

    const candidates = ["pwsh.exe", "powershell.exe", "cmd.exe", process.env.COMSPEC].filter(
      (value): value is string => Boolean(value && value.trim())
    );

    const seen = new Set<string>();
    const result: string[] = [];
    for (const candidate of candidates) {
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(candidate);
    }
    return result;
  }

  private spawnTerminal(session: TerminalSession, requestedShell?: string): SpawnResult {
    if (process.platform === "win32") {
      return this.spawnWindowsTerminal(session, requestedShell);
    }
    return this.spawnPosixTerminal(session, requestedShell);
  }

  private spawnPosixTerminal(session: TerminalSession, requestedShell?: string): SpawnResult {
    const shell = requestedShell || process.env.SHELL || "bash";

    const proc = Bun.spawn([shell], {
      cwd: session.cwd,
      env: { ...process.env, TERM: "xterm-256color" },
      terminal: {
        cols: session.cols,
        rows: session.rows,
        data: (_terminal: unknown, data: Buffer | Uint8Array) => {
          const text = Buffer.from(data).toString("utf-8");
          this.handleTerminalOutput(session, text);
        },
      },
    });

    proc.exited.then((code) => {
      this.handleTerminalExit(session, code ?? 0);
    });

    return {
      shell,
      proc: {
        write: (data) => {
          proc.terminal?.write(data);
        },
        resize: (cols, rows) => {
          proc.terminal?.resize(cols, rows);
        },
        kill: () => {
          proc.kill();
        },
      },
    };
  }

  private spawnWindowsTerminal(session: TerminalSession, requestedShell?: string): SpawnResult {
    const shells = this.getWindowsShellCandidates(requestedShell);
    let lastError: unknown = null;

    for (const shell of shells) {
      try {
        const proc = Bun.spawn([shell], {
          cwd: session.cwd,
          env: { ...process.env, TERM: "xterm-256color" },
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });

        this.attachReadable(proc.stdout, session);
        this.attachReadable(proc.stderr, session);
        proc.exited.then((code) => {
          this.handleTerminalExit(session, code ?? 0);
        });

        return {
          shell,
          proc: {
            write: (data) => {
              if (!proc.stdin || typeof proc.stdin === "number") {
                throw new Error("Terminal stdin is not available");
              }
              proc.stdin.write(this.prepareWindowsPipeInput(session, data));
              proc.stdin.flush();
            },
            resize: () => {
              // No PTY on Windows in Bun currently; keep API compatible with no-op resize.
            },
            kill: () => {
              proc.kill();
            },
          },
        };
      } catch (err) {
        lastError = err;
      }
    }

    const reason =
      lastError instanceof Error && lastError.message
        ? `Last error: ${lastError.message}`
        : "No shell executable could be started.";
    throw new Error(`Failed to create Windows terminal. ${reason}`);
  }

  private attachReadable(
    readable: ReadableStream<Uint8Array<ArrayBuffer>> | number | null | undefined,
    session: TerminalSession
  ): void {
    if (!readable || typeof readable === "number") return;

    const decoder = new TextDecoder();
    void (async () => {
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            this.handleTerminalOutput(session, decoder.decode(value, { stream: true }));
          }
        }
        const tail = decoder.decode();
        if (tail) this.handleTerminalOutput(session, tail);
      } catch {
        // Stream shutdown errors are expected when process exits.
      } finally {
        reader.releaseLock();
      }
    })();
  }

  private handleTerminalOutput(session: TerminalSession, text: string): void {
    const ports = detectPorts(text);
    for (const { port, url } of ports) {
      const key = `${session.id}:${port}`;
      if (!this.detectedPorts.has(key)) {
        this.detectedPorts.add(key);
        session.onPortDetected(port, url);
      }
    }

    const renderedText =
      process.platform === "win32" ? this.normalizeWindowsPipeOutput(text) : text;

    session.outputBuffer += renderedText;
    if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => {
        if (session.outputBuffer) {
          session.onData(session.outputBuffer);
          session.outputBuffer = "";
        }
        session.flushTimer = null;
      }, OUTPUT_FLUSH_INTERVAL);
    }
  }

  private prepareWindowsPipeInput(session: TerminalSession, data: string): string {
    // xterm.js sends DEL (\x7f) for Backspace by default.
    // Windows shell stdin in pipe mode expects BS (\b) to edit the current line.
    const normalized = data.replace(/\x7f/g, "\b");
    let result = "";

    for (const char of Array.from(normalized)) {
      if (char === "\b") {
        if (session.windowsPipeInputBuffer.length === 0) continue;
        session.windowsPipeInputBuffer.pop();
        result += char;
        continue;
      }

      if (char === "\r" || char === "\n" || char === "\x03") {
        session.windowsPipeInputBuffer = [];
        result += char;
        continue;
      }

      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint < 0x20 || codePoint === 0x7f) {
        result += char;
        continue;
      }

      session.windowsPipeInputBuffer.push(char);
      result += char;
    }

    return result;
  }

  private normalizeWindowsPipeOutput(data: string): string {
    // PowerShell in stdin/stdout pipe mode echoes bare BS (\b) on backspace.
    // xterm.js moves the cursor left for BS but does not erase the previous glyph,
    // so expand it to the classic erase sequence for correct visual behavior.
    return data.replace(/\x08/g, "\b \b");
  }

  private handleTerminalExit(session: TerminalSession, code: number): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.outputBuffer) {
      session.onData(session.outputBuffer);
      session.outputBuffer = "";
    }

    session.onExit(code);
    this.terminals.delete(session.id);
    this.clearDetectedPorts(session.id);
  }

  private clearDetectedPorts(terminalId: string): void {
    for (const key of this.detectedPorts) {
      if (key.startsWith(`${terminalId}:`)) {
        this.detectedPorts.delete(key);
      }
    }
  }
}
