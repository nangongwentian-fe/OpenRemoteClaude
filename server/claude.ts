import { query, type Query } from "@anthropic-ai/claude-agent-sdk";

const SESSION_CLEANUP_DELAY_MS = 60_000; // 完成后 60 秒清除
const SESSION_CLEANUP_INTERVAL_MS = 120_000; // 每 2 分钟扫描一次

export interface SessionInfo {
  id: string;
  cwd: string;
  isActive: boolean;
  abortController: AbortController;
  queryHandle: Query | null;
  completedAt: number | null;
  pendingPermissions: Map<string, {
    resolve: (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void;
  }>;
}

export type MessageCallback = (msg: unknown) => void;

export interface PermissionRequestInfo {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  decisionReason?: string;
  description?: string;
}

export type PermissionRequestCallback = (info: PermissionRequestInfo) => void;

export interface SessionOptions {
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  thinking?: { type: "adaptive" } | { type: "enabled"; budgetTokens?: number } | { type: "disabled" };
}

export class ClaudeSessionManager {
  private sessions = new Map<string, SessionInfo>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.sweepExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);
  }

  private sweepExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (
        session.completedAt !== null &&
        now - session.completedAt > SESSION_CLEANUP_DELAY_MS
      ) {
        session.queryHandle = null;
        this.sessions.delete(id);
        console.log(`[Session] Cleaned up expired session ${id}`);
      }
    }
  }

  private markCompleted(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.denyAllPendingPermissions(sessionId);
    session.isActive = false;
    session.queryHandle = null;
    session.completedAt = Date.now();
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    for (const [, session] of this.sessions) {
      if (session.isActive) {
        session.abortController.abort();
      }
      session.queryHandle = null;
    }
    this.sessions.clear();
    console.log("[Session] All sessions disposed");
  }

  abortIfActive(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session?.isActive) {
      session.abortController.abort();
      this.markCompleted(sessionId);
      console.log(`[Session] Aborted orphan session ${sessionId}`);
    }
  }

  async startSession(
    prompt: string,
    cwd: string,
    onMessage: MessageCallback,
    onComplete: () => void,
    onError: (err: Error) => void,
    onPermissionRequest: PermissionRequestCallback,
    resumeSessionId?: string,
    options?: SessionOptions
  ): Promise<string> {
    const sessionId = resumeSessionId || crypto.randomUUID();
    const abortController = new AbortController();

    const session: SessionInfo = {
      id: sessionId,
      cwd,
      isActive: true,
      abortController,
      queryHandle: null,
      completedAt: null,
      pendingPermissions: new Map(),
    };
    this.sessions.set(sessionId, session);

    const q = query({
      prompt,
      options: {
        cwd,
        abortController,
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        ...(options?.model ? { model: options.model } : {}),
        ...(options?.effort ? { effort: options.effort } : {}),
        ...(options?.thinking ? { thinking: options.thinking } : {}),
        allowedTools: [
          "Read",
          "Edit",
          "Write",
          "Bash",
          "Glob",
          "Grep",
          "WebSearch",
          "WebFetch",
          "TodoWrite",
          "Skill",
          "Agent",
          "NotebookEdit",
          "LSP",
        ],
        permissionMode: "acceptEdits",
        maxTurns: 50,
        includePartialMessages: true,
        canUseTool: async (toolName, input, opts) => {
          return new Promise((resolve) => {
            const requestId = opts.toolUseID;
            session.pendingPermissions.set(requestId, { resolve });

            onPermissionRequest({
              requestId,
              toolName,
              input,
              decisionReason: opts.decisionReason,
            });

            opts.signal.addEventListener("abort", () => {
              if (session.pendingPermissions.has(requestId)) {
                session.pendingPermissions.delete(requestId);
                resolve({ behavior: "deny", message: "Request aborted" });
              }
            });
          });
        },
      },
    });

    session.queryHandle = q;

    // 异步处理消息流
    (async () => {
      try {
        for await (const message of q) {
          onMessage(message);
        }
        onComplete();
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.markCompleted(sessionId);
      }
    })();

    return sessionId;
  }

  async getCapabilities(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session?.queryHandle) return null;

    try {
      const [models, commands, mcpStatus] = await Promise.all([
        session.queryHandle.supportedModels(),
        session.queryHandle.supportedCommands(),
        session.queryHandle.mcpServerStatus(),
      ]);
      return { models, commands, mcpServers: mcpStatus };
    } catch {
      return null;
    }
  }

  async setModel(sessionId: string, model: string) {
    const session = this.sessions.get(sessionId);
    if (session?.queryHandle) {
      await session.queryHandle.setModel(model);
    }
  }

  async setPermissionMode(sessionId: string, mode: string) {
    const session = this.sessions.get(sessionId);
    if (session?.queryHandle) {
      await session.queryHandle.setPermissionMode(mode as "default" | "acceptEdits" | "plan" | "dontAsk");
    }
  }

  async interruptSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session?.queryHandle) {
      await session.queryHandle.interrupt();
    }
  }

  abortSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.abortController.abort();
      this.markCompleted(sessionId);
    }
  }

  resolvePermission(sessionId: string, requestId: string, behavior: "allow" | "deny") {
    const session = this.sessions.get(sessionId);
    const pending = session?.pendingPermissions.get(requestId);
    if (pending) {
      session!.pendingPermissions.delete(requestId);
      if (behavior === "allow") {
        pending.resolve({ behavior: "allow" });
      } else {
        pending.resolve({ behavior: "deny", message: "Denied by user" });
      }
    }
  }

  denyAllPendingPermissions(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    for (const [id, pending] of session.pendingPermissions) {
      pending.resolve({ behavior: "deny", message: "Session ended" });
    }
    session.pendingPermissions.clear();
  }

  getActiveSession(): SessionInfo | undefined {
    for (const session of this.sessions.values()) {
      if (session.isActive) return session;
    }
    return undefined;
  }

  getAnySessionWithHandle(): SessionInfo | undefined {
    for (const session of this.sessions.values()) {
      if (session.isActive && session.queryHandle) return session;
    }
    return undefined;
  }

  isSessionActive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isActive ?? false;
  }

  /**
   * 创建一个轻量级探测 session 获取 capabilities（模型列表等），然后立即 abort。
   * 用于在没有活跃 session 时获取可用模型信息。
   */
  async probeCapabilities(cwd: string): Promise<{ models: unknown[]; commands: unknown[]; mcpServers: unknown[] } | null> {
    const abortController = new AbortController();
    let q: Query | null = null;
    try {
      q = query({
        prompt: "hi",
        options: {
          cwd,
          abortController,
          maxTurns: 1,
          permissionMode: "plan",
          allowedTools: [],
        },
      });

      const initResult = await q.initializationResult();
      return {
        models: initResult.models,
        commands: initResult.commands,
        mcpServers: [],
      };
    } catch {
      return null;
    } finally {
      abortController.abort();
      q = null;
    }
  }
}
