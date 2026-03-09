import { verify } from "hono/jwt";
import { ClaudeSessionManager, type SessionOptions } from "./claude";
import { DataStore } from "./db";
import type { ServerWebSocket } from "bun";

const DISCONNECT_ABORT_DELAY_MS = 30_000; // 断连 30 秒后 abort 进行中的 session

// SDK 消息类型（简化定义，运行时用 type 字段判断）
interface SDKMessage {
  type: string;
  [key: string]: unknown;
}

interface WSState {
  authenticated: boolean;
  clientId: string;
  activeSessionId: string | null;
}

const sessionManager = new ClaudeSessionManager();

export { sessionManager };

function send(ws: ServerWebSocket<WSState>, data: unknown) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// Delta 微批处理：合并 16ms 内的同类型 delta，减少 WebSocket 帧数
type DeltaBuffer = {
  text: Map<number, string>;      // blockIndex -> accumulated text
  thinking: Map<number, string>;   // blockIndex -> accumulated thinking
  toolInput: Map<number, string>;  // blockIndex -> accumulated input delta
  timer: ReturnType<typeof setTimeout> | null;
};

function createDeltaBuffer(): DeltaBuffer {
  return { text: new Map(), thinking: new Map(), toolInput: new Map(), timer: null };
}

function flushDeltaBuffer(ws: ServerWebSocket<WSState>, buf: DeltaBuffer) {
  for (const [blockIndex, text] of buf.text) {
    send(ws, { type: "stream_delta", payload: { text, blockIndex } });
  }
  for (const [blockIndex, thinking] of buf.thinking) {
    send(ws, { type: "thinking_delta", payload: { thinking, blockIndex } });
  }
  for (const [blockIndex, delta] of buf.toolInput) {
    send(ws, { type: "tool_input_delta", payload: { delta, blockIndex } });
  }
  buf.text.clear();
  buf.thinking.clear();
  buf.toolInput.clear();
  buf.timer = null;
}

function scheduleDeltaFlush(ws: ServerWebSocket<WSState>, buf: DeltaBuffer) {
  if (!buf.timer) {
    buf.timer = setTimeout(() => flushDeltaBuffer(ws, buf), 16);
  }
}

function mapCommands(commands: Array<Record<string, unknown>>) {
  return commands
    .map((command) => ({
      name: String(command.name ?? command.command ?? ""),
      description: typeof command.description === "string" ? command.description : undefined,
      argumentHint: typeof command.argumentHint === "string" ? command.argumentHint : undefined,
    }))
    .filter((command) => command.name);
}

function forwardSDKMessage(ws: ServerWebSocket<WSState>, msg: SDKMessage, deltaBuf: DeltaBuffer) {
  switch (msg.type) {
    case "stream_event": {
      const event = msg.event as Record<string, unknown>;
      if (!event) break;

      const eventType = event.type as string;

      if (eventType === "content_block_delta") {
        const delta = event.delta as Record<string, unknown>;
        if (delta?.type === "text_delta") {
          // 使用 buffer 合并文本 delta
          const blockIndex = event.index as number;
          const existing = deltaBuf.text.get(blockIndex) || "";
          deltaBuf.text.set(blockIndex, existing + (delta.text as string));
          scheduleDeltaFlush(ws, deltaBuf);
        } else if (delta?.type === "thinking_delta") {
          // 使用 buffer 合并 thinking delta
          const blockIndex = event.index as number;
          const existing = deltaBuf.thinking.get(blockIndex) || "";
          deltaBuf.thinking.set(blockIndex, existing + (delta.thinking as string));
          scheduleDeltaFlush(ws, deltaBuf);
        } else if (delta?.type === "input_json_delta") {
          // 使用 buffer 合并 tool input delta
          const blockIndex = event.index as number;
          const existing = deltaBuf.toolInput.get(blockIndex) || "";
          deltaBuf.toolInput.set(blockIndex, existing + (delta.partial_json as string));
          scheduleDeltaFlush(ws, deltaBuf);
        }
      } else if (eventType === "content_block_start") {
        // block start 前先 flush 积压的 delta
        if (deltaBuf.timer) {
          clearTimeout(deltaBuf.timer);
          flushDeltaBuffer(ws, deltaBuf);
        }
        const block = event.content_block as Record<string, unknown>;
        if (block?.type === "tool_use") {
          send(ws, {
            type: "tool_start",
            payload: {
              id: block.id,
              name: block.name,
              blockIndex: event.index,
            },
          });
        } else if (block?.type === "thinking") {
          send(ws, {
            type: "thinking_start",
            payload: { blockIndex: event.index },
          });
        }
      } else if (eventType === "content_block_stop") {
        // block stop 前先 flush 积压的 delta
        if (deltaBuf.timer) {
          clearTimeout(deltaBuf.timer);
          flushDeltaBuffer(ws, deltaBuf);
        }
        send(ws, {
          type: "block_stop",
          payload: { blockIndex: event.index },
        });
      }
      break;
    }

    case "assistant": {
      // 完整消息到达前 flush 所有积压的 delta
      if (deltaBuf.timer) {
        clearTimeout(deltaBuf.timer);
        flushDeltaBuffer(ws, deltaBuf);
      }
      const message = msg.message as Record<string, unknown>;
      const content = message?.content;
      if (Array.isArray(content)) {
        const blocks = content.map((block: Record<string, unknown>) => {
          if (block.type === "text")
            return { type: "text", text: block.text };
          if (block.type === "tool_use")
            return {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            };
          if (block.type === "thinking")
            return { type: "thinking", thinking: block.thinking };
          if (block.type === "tool_result")
            return {
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error,
            };
          return block;
        });
        send(ws, {
          type: "assistant_message",
          payload: { content: blocks, model: message.model },
        });
      }
      break;
    }

    case "result": {
      // result 前 flush 所有积压的 delta
      if (deltaBuf.timer) {
        clearTimeout(deltaBuf.timer);
        flushDeltaBuffer(ws, deltaBuf);
      }
      send(ws, {
        type: "result",
        payload: {
          sessionId: msg.session_id,
          durationMs: msg.duration_ms,
          isError: msg.is_error,
          numTurns: msg.num_turns,
        },
      });
      break;
    }

    case "system": {
      if (msg.subtype === "init") {
        const mcpServers = Array.isArray(msg.mcp_servers)
          ? (msg.mcp_servers as Array<{ name: string; status: string }>).map((s) => ({
              name: s.name,
              status: s.status,
            }))
          : [];

        const slashCommands = Array.isArray(msg.slash_commands)
          ? (msg.slash_commands as string[])
          : [];
        const skills = Array.isArray(msg.skills)
          ? (msg.skills as string[])
          : [];

        send(ws, {
          type: "system_init",
          payload: {
            sessionId: msg.session_id,
            tools: msg.tools,
            model: msg.model,
            permissionMode: msg.permissionMode,
            mcpServers,
            slashCommands,
            skills,
          },
        });

        // 异步获取详细能力信息
        const sessionId = msg.session_id as string;
        if (sessionId) {
          sendCapabilities(ws, sessionId);
        }
      }
      break;
    }
  }
}

async function sendCapabilities(ws: ServerWebSocket<WSState>, sessionId: string) {
  try {
    const caps = await sessionManager.getCapabilities(sessionId);
    if (!caps) return;

    send(ws, {
      type: "capabilities",
      payload: {
        models: (caps.models as Array<Record<string, unknown>>).map((m) => ({
          value: m.value,
          displayName: m.displayName,
          description: m.description,
          supportsEffort: m.supportsEffort,
          supportedEffortLevels: m.supportedEffortLevels,
          supportsAdaptiveThinking: m.supportsAdaptiveThinking,
          supportsFastMode: m.supportsFastMode,
        })),
        commands: mapCommands(caps.commands as Array<Record<string, unknown>>),
        mcpServers: (caps.mcpServers as Array<Record<string, unknown>>).map((s) => ({
          name: s.name,
          status: s.status,
        })),
      },
    });
  } catch {
    // capabilities 获取失败不影响正常使用
  }
}

export function createWSHandlers(jwtSecret: string, db: DataStore) {
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // 每个连接一个 delta buffer
  const deltaBuffers = new WeakMap<ServerWebSocket<WSState>, DeltaBuffer>();

  function getDeltaBuffer(ws: ServerWebSocket<WSState>): DeltaBuffer {
    let buf = deltaBuffers.get(ws);
    if (!buf) {
      buf = createDeltaBuffer();
      deltaBuffers.set(ws, buf);
    }
    return buf;
  }

  return {
    open(ws: ServerWebSocket<WSState>) {
      send(ws, {
        type: "status",
        payload: { connected: true, needsAuth: true },
      });
    },

    async message(ws: ServerWebSocket<WSState>, message: string | Buffer) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(
          typeof message === "string" ? message : message.toString()
        );
      } catch {
        send(ws, { type: "error", payload: { message: "Invalid JSON" } });
        return;
      }

      switch (data.type) {
        case "auth": {
          try {
            await verify(data.token as string, jwtSecret, "HS256");
            ws.data.authenticated = true;
            send(ws, {
              type: "auth_result",
              payload: { success: true },
            });
          } catch {
            send(ws, {
              type: "auth_result",
              payload: { success: false, error: "Invalid token" },
            });
          }
          break;
        }

        case "chat": {
          if (!ws.data.authenticated) {
            send(ws, {
              type: "error",
              payload: { message: "Not authenticated" },
            });
            return;
          }

          const payload = data.payload as {
            prompt: string;
            cwd?: string;
            resumeSessionId?: string;
            model?: string;
            effort?: string;
            thinking?: string;
            permissionMode?: SessionOptions["permissionMode"];
          };

          if (!payload?.prompt) {
            send(ws, {
              type: "error",
              payload: { message: "Missing prompt" },
            });
            return;
          }

          const cwd = payload.cwd || process.cwd();
          const resolvedPrompt = await sessionManager.resolvePrompt(payload.prompt, cwd);

          // 构建 SDK 选项
          const sessionOpts: SessionOptions = {};
          if (payload.model) sessionOpts.model = payload.model;
          if (payload.effort) sessionOpts.effort = payload.effort as SessionOptions["effort"];
          if (payload.thinking) {
            if (payload.thinking === "disabled") {
              sessionOpts.thinking = { type: "disabled" };
            } else if (payload.thinking === "adaptive") {
              sessionOpts.thinking = { type: "adaptive" };
            } else if (payload.thinking === "enabled") {
              sessionOpts.thinking = { type: "enabled" };
            }
          }
          if (payload.permissionMode) {
            sessionOpts.permissionMode = payload.permissionMode;
          }

          send(ws, { type: "chat_started", payload: { cwd } });

          // 如果在恢复之前有断连定时器，取消它
          if (payload.resumeSessionId) {
            const timer = disconnectTimers.get(payload.resumeSessionId);
            if (timer) {
              clearTimeout(timer);
              disconnectTimers.delete(payload.resumeSessionId);
            }
          }

          try {
            const deltaBuf = getDeltaBuffer(ws);
            const sessionId = await sessionManager.startSession(
              resolvedPrompt,
              cwd,
              (msg) => forwardSDKMessage(ws, msg as SDKMessage, deltaBuf),
              () => {
                ws.data.activeSessionId = null;
                const timer = disconnectTimers.get(sessionId);
                if (timer) {
                  clearTimeout(timer);
                  disconnectTimers.delete(sessionId);
                }
                send(ws, {
                  type: "chat_complete",
                  payload: { sessionId },
                });
                sendCapabilities(ws, sessionId);
              },
              (err) => {
                ws.data.activeSessionId = null;
                const timer = disconnectTimers.get(sessionId);
                if (timer) {
                  clearTimeout(timer);
                  disconnectTimers.delete(sessionId);
                }
                send(ws, {
                  type: "error",
                  payload: { message: err.message },
                });
              },
              (permReq) => {
                send(ws, { type: "permission_request", payload: permReq });
              },
              payload.resumeSessionId,
              sessionOpts
            );

            ws.data.activeSessionId = sessionId;
            db.createSession(sessionId, cwd);
            db.saveMessage(sessionId, "user", { prompt: payload.prompt });
          } catch (err) {
            send(ws, {
              type: "error",
              payload: {
                message:
                  err instanceof Error ? err.message : "Failed to start session",
              },
            });
          }
          break;
        }

        case "set_model": {
          if (!ws.data.authenticated) return;
          const activeSession = sessionManager.getActiveSession();
          if (activeSession) {
            try {
              const model = (data.payload as { model: string }).model;
              await sessionManager.setModel(activeSession.id, model);
              send(ws, { type: "model_changed", payload: { model } });
            } catch (err) {
              send(ws, {
                type: "error",
                payload: { message: err instanceof Error ? err.message : "Failed to set model" },
              });
            }
          }
          break;
        }

        case "set_permission_mode": {
          if (!ws.data.authenticated) return;
          const active = sessionManager.getActiveSession();
          if (active) {
            try {
              const mode = (data.payload as { mode: string }).mode;
              await sessionManager.setPermissionMode(active.id, mode);
              send(ws, { type: "permission_mode_changed", payload: { mode } });
            } catch (err) {
              send(ws, {
                type: "error",
                payload: { message: err instanceof Error ? err.message : "Failed to set permission mode" },
              });
            }
          }
          break;
        }

        case "request_capabilities": {
          if (!ws.data.authenticated) return;
          const session = sessionManager.getAnySessionWithHandle();
          if (session) {
            await sendCapabilities(ws, session.id);
          } else {
            // 无活跃 session 时通过探测获取 capabilities
            try {
              const payload = (data.payload as { cwd?: string } | undefined) ?? {};
              const caps = await sessionManager.probeCapabilities(payload.cwd || process.cwd());
              if (caps) {
                send(ws, {
                  type: "capabilities",
                  payload: {
                    models: (caps.models as Array<Record<string, unknown>>).map((m) => ({
                      value: m.value,
                      displayName: m.displayName,
                      description: m.description,
                      supportsEffort: m.supportsEffort,
                      supportedEffortLevels: m.supportedEffortLevels,
                      supportsAdaptiveThinking: m.supportsAdaptiveThinking,
                      supportsFastMode: m.supportsFastMode,
                    })),
                    commands: mapCommands(caps.commands as Array<Record<string, unknown>>),
                    mcpServers: [],
                  },
                });
              }
            } catch {
              // probe 失败不影响正常使用
            }
          }
          break;
        }

        case "interrupt": {
          if (!ws.data.authenticated) return;
          const interruptSession = sessionManager.getActiveSession();
          if (interruptSession) {
            await sessionManager.interruptSession(interruptSession.id);
            send(ws, { type: "interrupted", payload: {} });
          }
          break;
        }

        case "abort": {
          if (!ws.data.authenticated) return;
          const abortSession = sessionManager.getActiveSession();
          if (abortSession) {
            sessionManager.abortSession(abortSession.id);
            send(ws, { type: "aborted", payload: {} });
          }
          break;
        }

        case "permission_response": {
          if (!ws.data.authenticated) return;
          const permPayload = data.payload as { requestId: string; behavior: "allow" | "deny" };
          const permSession = sessionManager.getActiveSession();
          if (permSession && permPayload?.requestId) {
            sessionManager.resolvePermission(permSession.id, permPayload.requestId, permPayload.behavior);
          }
          break;
        }

        case "ping": {
          send(ws, { type: "pong" });
          break;
        }
      }
    },

    close(ws: ServerWebSocket<WSState>) {
      console.log(`[WS] Client disconnected: ${ws.data.clientId}`);

      // 清理 delta buffer
      const buf = deltaBuffers.get(ws);
      if (buf?.timer) {
        clearTimeout(buf.timer);
        buf.timer = null;
      }

      const activeSessionId = ws.data.activeSessionId;
      if (activeSessionId) {
        // 立即 deny 所有 pending 权限请求，避免卡死
        sessionManager.denyAllPendingPermissions(activeSessionId);

        if (!disconnectTimers.has(activeSessionId)) {
          disconnectTimers.set(
            activeSessionId,
            setTimeout(() => {
              console.log(`[WS] Client did not reconnect, aborting session ${activeSessionId}`);
              sessionManager.abortIfActive(activeSessionId);
              disconnectTimers.delete(activeSessionId);
            }, DISCONNECT_ABORT_DELAY_MS)
          );
        }
      }
    },
  };
}

export type { WSState };
