import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const SESSION_CLEANUP_DELAY_MS = 60_000; // 完成后 60 秒清除
const SESSION_CLEANUP_INTERVAL_MS = 300_000; // 每 5 分钟扫描一次（兜底）
const SDK_SETTING_SOURCES = ["user", "project", "local"] as const;

interface SlashCommandDefinition {
  name: string;
  description?: string;
  argumentHint?: string;
  filePath?: string;
  body?: string;
}

type LocalSlashCommand = SlashCommandDefinition & {
  body: string;
  filePath: string;
};

function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { body: normalized.trim(), metadata: {} as Record<string, string> };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { body: normalized.trim(), metadata: {} as Record<string, string> };
  }

  const raw = normalized.slice(4, end);
  const metadata: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    metadata[match[1].toLowerCase()] = stripQuotes(match[2].trim());
  }

  return {
    body: normalized.slice(end + 5).trim(),
    metadata,
  };
}

function buildCommandName(relativePath: string) {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\/SKILL\.md$/i, "")
    .replace(/\.md$/i, "")
    .split("/")
    .filter(Boolean)
    .join(":");
}

async function collectFiles(dir: string, matcher: (filePath: string) => boolean): Promise<string[]> {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(filePath, matcher));
      continue;
    }
    if (entry.isFile() && matcher(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

async function loadMarkdownCommand(filePath: string, relativePath: string) {
  const content = await readFile(filePath, "utf8");
  const { body, metadata } = parseFrontmatter(content);
  const name = metadata.name?.trim() || buildCommandName(relativePath);
  if (!name) return null;

  return {
    name,
    description: metadata.description?.trim(),
    argumentHint: metadata["argument-hint"]?.trim(),
    filePath,
    body,
  } satisfies LocalSlashCommand;
}

async function discoverFallbackSlashCommands(cwd: string) {
  const normalizedCwd = resolve(cwd);
  const candidateDirs = [
    join(normalizedCwd, ".claude"),
    join(homedir(), ".claude"),
  ].filter((dir, index, dirs) => existsSync(dir) && dirs.indexOf(dir) === index);

  const merged = new Map<string, LocalSlashCommand>();

  for (const claudeDir of candidateDirs) {
    const commandsRoot = join(claudeDir, "commands");
    const skillsRoot = join(claudeDir, "skills");
    const [commandFiles, skillFiles] = await Promise.all([
      collectFiles(commandsRoot, (filePath) => extname(filePath).toLowerCase() === ".md"),
      collectFiles(skillsRoot, (filePath) => filePath.endsWith("/SKILL.md") || filePath.endsWith("\\SKILL.md")),
    ]);

    const loaded = await Promise.all([
      ...commandFiles.map((filePath) => loadMarkdownCommand(filePath, relative(commandsRoot, filePath))),
      ...skillFiles.map((filePath) => loadMarkdownCommand(filePath, relative(skillsRoot, filePath))),
    ]);

    for (const command of loaded) {
      if (command && !merged.has(command.name)) {
        merged.set(command.name, command);
      }
    }
  }

  return [...merged.values()];
}

function parseSlashInvocation(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("/")) return null;

  const withoutSlash = trimmed.slice(1);
  const firstWhitespace = withoutSlash.search(/\s/);
  if (firstWhitespace === -1) {
    return { args: "", name: withoutSlash };
  }

  return {
    name: withoutSlash.slice(0, firstWhitespace),
    args: withoutSlash.slice(firstWhitespace).trim(),
  };
}

function extractCommandNames(commands: unknown[]) {
  return new Set(
    commands
      .map((command) => {
        if (typeof command === "string") return command;
        if (command && typeof command === "object") {
          const record = command as Record<string, unknown>;
          return String(record.name ?? record.command ?? "");
        }
        return "";
      })
      .filter(Boolean)
  );
}

function applyCommandArguments(body: string, args: string) {
  const positional = args ? args.split(/\s+/) : [];
  let expanded = body.replace(/\$ARGUMENTS\b/g, args);

  positional.forEach((value, index) => {
    expanded = expanded.replace(new RegExp(`\\$${index + 1}(?!\\d)`, "g"), value);
  });

  return expanded;
}

function runShellCommand(command: string, cwd: string) {
  return new Promise<string>((resolveCommand) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (output: string) => {
      if (settled) return;
      settled = true;
      resolveCommand(output.trim());
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish(`Command failed: ${error.message}`);
    });
    child.on("close", (code) => {
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      if (combined) {
        finish(combined);
      } else if (code && code !== 0) {
        finish(`Command exited with status ${code}`);
      } else {
        finish("(no output)");
      }
    });

    setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
        finish("Command timed out after 10s");
      }
    }, 10_000);
  });
}

async function expandBangCommands(body: string, cwd: string) {
  const matches = [...body.matchAll(/!`([^`]+)`/g)];
  if (matches.length === 0) return body;

  let expanded = body;
  for (const match of matches) {
    const command = match[1]?.trim();
    if (!command) continue;

    const output = await runShellCommand(command, cwd);
    const replacement = `\n\`\`\`text\n${output || "(no output)"}\n\`\`\``;
    expanded = expanded.replace(match[0], replacement);
  }

  return expanded;
}

async function buildLocalCommandPrompt(command: LocalSlashCommand, args: string, cwd: string) {
  const withArgs = applyCommandArguments(command.body, args);
  const withCommandOutput = await expandBangCommands(withArgs, cwd);

  return [
    `# Local Claude Code Command`,
    `Source: ${command.filePath}`,
    `Invocation: /${command.name}${args ? ` ${args}` : ""}`,
    "",
    withCommandOutput,
  ].join("\n");
}

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
  permissionMode?: "default" | "acceptEdits" | "plan" | "dontAsk";
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

    // 精确定时清理，不依赖扫描间隔
    setTimeout(() => {
      const s = this.sessions.get(sessionId);
      if (s && s.completedAt !== null) {
        this.sessions.delete(sessionId);
        console.log(`[Session] Cleaned up session ${sessionId}`);
      }
    }, SESSION_CLEANUP_DELAY_MS);
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
        settingSources: [...SDK_SETTING_SOURCES],
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
        permissionMode: options?.permissionMode ?? "acceptEdits",
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
            }, { once: true });
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
          settingSources: [...SDK_SETTING_SOURCES],
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

  async resolvePrompt(prompt: string, cwd: string) {
    const invocation = parseSlashInvocation(prompt);
    if (!invocation) return prompt;

    const caps = await this.probeCapabilities(cwd);
    if (!caps) return prompt;

    const knownCommands = extractCommandNames(caps.commands);
    if (knownCommands.has(invocation.name)) {
      return prompt;
    }

    const localCommands = await discoverFallbackSlashCommands(cwd);
    const command = localCommands.find((item) => item.name === invocation.name);
    if (!command) return prompt;

    return buildLocalCommandPrompt(command, invocation.args, cwd);
  }
}
