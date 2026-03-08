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

function forwardSDKMessage(ws: ServerWebSocket<WSState>, msg: SDKMessage) {
  switch (msg.type) {
    case "stream_event": {
      const event = msg.event as Record<string, unknown>;
      if (!event) break;

      const eventType = event.type as string;

      if (eventType === "content_block_delta") {
        const delta = event.delta as Record<string, unknown>;
        if (delta?.type === "text_delta") {
          send(ws, {
            type: "stream_delta",
            payload: { text: delta.text, blockIndex: event.index },
          });
        } else if (delta?.type === "thinking_delta") {
          send(ws, {
            type: "thinking_delta",
            payload: { thinking: delta.thinking, blockIndex: event.index },
          });
        } else if (delta?.type === "input_json_delta") {
          send(ws, {
            type: "tool_input_delta",
            payload: { delta: delta.partial_json, blockIndex: event.index },
          });
        }
      } else if (eventType === "content_block_start") {
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
        send(ws, {
          type: "block_stop",
          payload: { blockIndex: event.index },
        });
      }
      break;
    }

    case "assistant": {
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

        send(ws, {
          type: "system_init",
          payload: {
            sessionId: msg.session_id,
            tools: msg.tools,
            model: msg.model,
            permissionMode: msg.permissionMode,
            mcpServers,
            slashCommands,
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
        commands: (caps.commands as Array<Record<string, unknown>>).map((c) => ({
          name: c.name ?? c.command ?? c,
          description: c.description,
        })),
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
          };

          if (!payload?.prompt) {
            send(ws, {
              type: "error",
              payload: { message: "Missing prompt" },
            });
            return;
          }

          const cwd = payload.cwd || process.cwd();

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
            const sessionId = await sessionManager.startSession(
              payload.prompt,
              cwd,
              (msg) => forwardSDKMessage(ws, msg as SDKMessage),
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
              const caps = await sessionManager.probeCapabilities(process.cwd());
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
                    commands: (caps.commands as Array<Record<string, unknown>>).map((c) => ({
                      name: (c as Record<string, unknown>).name ?? (c as Record<string, unknown>).command ?? c,
                      description: (c as Record<string, unknown>).description,
                    })),
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
