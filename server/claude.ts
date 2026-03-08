import { query, type Query } from "@anthropic-ai/claude-agent-sdk";

export interface SessionInfo {
  id: string;
  cwd: string;
  isActive: boolean;
  abortController: AbortController;
  queryHandle: Query | null;
}

export type MessageCallback = (msg: unknown) => void;

export interface SessionOptions {
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
  thinking?: { type: "adaptive" } | { type: "enabled"; budgetTokens?: number } | { type: "disabled" };
}

export class ClaudeSessionManager {
  private sessions = new Map<string, SessionInfo>();

  async startSession(
    prompt: string,
    cwd: string,
    onMessage: MessageCallback,
    onComplete: () => void,
    onError: (err: Error) => void,
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
        session.isActive = false;
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
      session.isActive = false;
    }
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
    for (const session of this.sessions.values()) {
      if (session.queryHandle) return session;
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
    try {
      const q = query({
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
      abortController.abort();
      return {
        models: initResult.models,
        commands: initResult.commands,
        mcpServers: [],
      };
    } catch {
      abortController.abort();
      return null;
    }
  }
}
