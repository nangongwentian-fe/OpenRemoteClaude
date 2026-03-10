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

function send(ws: ServerWebSocket<WSState> | null | undefined, data: unknown) {
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// 每个 session 一个可重绑定的流式转发器，允许断线后把输出挂到新连接。
type SessionBinding = {
  ws: ServerWebSocket<WSState> | null;
  pendingMessages: unknown[];
  text: Map<number, string>;       // blockIndex -> accumulated text
  thinking: Map<number, string>;   // blockIndex -> accumulated thinking
  toolInput: Map<number, string>;  // blockIndex -> accumulated input delta
  timer: ReturnType<typeof setTimeout> | null;
};

function createSessionBinding(ws: ServerWebSocket<WSState> | null): SessionBinding {
  return {
    ws,
    pendingMessages: [],
    text: new Map(),
    thinking: new Map(),
    toolInput: new Map(),
    timer: null,
  };
}

function sendOrQueue(binding: SessionBinding, data: unknown) {
  if (binding.ws?.readyState === 1) {
    binding.ws.send(JSON.stringify(data));
    return;
  }
  binding.pendingMessages.push(data);
}

function flushQueuedMessages(binding: SessionBinding) {
  if (binding.ws?.readyState !== 1 || binding.pendingMessages.length === 0) return;

  const queued = [...binding.pendingMessages];
  binding.pendingMessages = [];

  for (const message of queued) {
    binding.ws.send(JSON.stringify(message));
  }
}

function flushDeltaBuffer(binding: SessionBinding) {
  for (const [blockIndex, text] of binding.text) {
    sendOrQueue(binding, { type: "stream_delta", payload: { text, blockIndex } });
  }
  for (const [blockIndex, thinking] of binding.thinking) {
    sendOrQueue(binding, { type: "thinking_delta", payload: { thinking, blockIndex } });
  }
  for (const [blockIndex, delta] of binding.toolInput) {
    sendOrQueue(binding, { type: "tool_input_delta", payload: { delta, blockIndex } });
  }
  binding.text.clear();
  binding.thinking.clear();
  binding.toolInput.clear();
  binding.timer = null;
}

function scheduleDeltaFlush(binding: SessionBinding) {
  if (!binding.timer) {
    binding.timer = setTimeout(() => flushDeltaBuffer(binding), 16);
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

function forwardSDKMessage(binding: SessionBinding, msg: SDKMessage, managedSessionId: string) {
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
          const existing = binding.text.get(blockIndex) || "";
          binding.text.set(blockIndex, existing + (delta.text as string));
          scheduleDeltaFlush(binding);
        } else if (delta?.type === "thinking_delta") {
          // 使用 buffer 合并 thinking delta
          const blockIndex = event.index as number;
          const existing = binding.thinking.get(blockIndex) || "";
          binding.thinking.set(blockIndex, existing + (delta.thinking as string));
          scheduleDeltaFlush(binding);
        } else if (delta?.type === "input_json_delta") {
          // 使用 buffer 合并 tool input delta
          const blockIndex = event.index as number;
          const existing = binding.toolInput.get(blockIndex) || "";
          binding.toolInput.set(blockIndex, existing + (delta.partial_json as string));
          scheduleDeltaFlush(binding);
        }
      } else if (eventType === "content_block_start") {
        // block start 前先 flush 积压的 delta
        if (binding.timer) {
          clearTimeout(binding.timer);
          flushDeltaBuffer(binding);
        }
        const block = event.content_block as Record<string, unknown>;
        if (block?.type === "tool_use") {
          sendOrQueue(binding, {
            type: "tool_start",
            payload: {
              id: block.id,
              name: block.name,
              blockIndex: event.index,
            },
          });
        } else if (block?.type === "thinking") {
          sendOrQueue(binding, {
            type: "thinking_start",
            payload: { blockIndex: event.index },
          });
        }
      } else if (eventType === "content_block_stop") {
        // block stop 前先 flush 积压的 delta
        if (binding.timer) {
          clearTimeout(binding.timer);
          flushDeltaBuffer(binding);
        }
        sendOrQueue(binding, {
          type: "block_stop",
          payload: { blockIndex: event.index },
        });
      }
      break;
    }

    case "assistant": {
      // 完整消息到达前 flush 所有积压的 delta
      if (binding.timer) {
        clearTimeout(binding.timer);
        flushDeltaBuffer(binding);
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
        sendOrQueue(binding, {
          type: "assistant_message",
          payload: { content: blocks, model: message.model },
        });
      }
      break;
    }

    case "result": {
      // result 前 flush 所有积压的 delta
      if (binding.timer) {
        clearTimeout(binding.timer);
        flushDeltaBuffer(binding);
      }
      sendOrQueue(binding, {
        type: "result",
        payload: {
          sessionId: managedSessionId || (msg.session_id as string),
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

        sendOrQueue(binding, {
          type: "system_init",
          payload: {
            sessionId: managedSessionId || (msg.session_id as string),
            tools: msg.tools,
            model: msg.model,
            permissionMode: msg.permissionMode,
            mcpServers,
            slashCommands,
            skills,
          },
        });

        // 异步获取详细能力信息
        const sessionId = managedSessionId || (msg.session_id as string);
        if (sessionId) {
          sendCapabilities(binding.ws, sessionId);
        }
      }
      break;
    }
  }
}

async function sendCapabilities(ws: ServerWebSocket<WSState> | null, sessionId: string) {
  try {
    const caps = await sessionManager.getCapabilities(sessionId);
    if (!caps) return false;

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
    return true;
  } catch {
    // capabilities 获取失败不影响正常使用
    return false;
  }
}

export function createWSHandlers(jwtSecret: string, db: DataStore) {
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sessionBindings = new Map<string, SessionBinding>();

  function clearDisconnectTimer(sessionId: string) {
    const timer = disconnectTimers.get(sessionId);
    if (!timer) return;
    clearTimeout(timer);
    disconnectTimers.delete(sessionId);
  }

  function startDisconnectTimer(sessionId: string) {
    if (disconnectTimers.has(sessionId)) return;

    disconnectTimers.set(
      sessionId,
      setTimeout(() => {
        console.log(`[WS] Client did not reconnect, aborting session ${sessionId}`);
        sessionManager.denyAllPendingPermissions(sessionId);
        sessionManager.abortIfActive(sessionId);
        sessionBindings.delete(sessionId);
        disconnectTimers.delete(sessionId);
      }, DISCONNECT_ABORT_DELAY_MS)
    );
  }

  function detachSessionFromSocket(ws: ServerWebSocket<WSState>, sessionId: string) {
    const binding = sessionBindings.get(sessionId);
    if (binding?.ws === ws) {
      binding.ws = null;
      startDisconnectTimer(sessionId);
    }
    if (ws.data.activeSessionId === sessionId) {
      ws.data.activeSessionId = null;
    }
  }

  function replayPendingPermissions(ws: ServerWebSocket<WSState>, sessionId: string) {
    for (const permReq of sessionManager.getPendingPermissions(sessionId)) {
      send(ws, {
        type: "permission_request",
        payload: {
          sessionId,
          ...permReq,
        },
      });
    }
  }

  function attachSession(ws: ServerWebSocket<WSState>, sessionId: string) {
    if (ws.data.activeSessionId && ws.data.activeSessionId !== sessionId) {
      if (sessionManager.isSessionActive(ws.data.activeSessionId)) {
        detachSessionFromSocket(ws, ws.data.activeSessionId);
      } else {
        const currentBinding = sessionBindings.get(ws.data.activeSessionId);
        if (currentBinding?.ws === ws) {
          currentBinding.ws = null;
        }
        ws.data.activeSessionId = null;
      }
    }

    const binding = sessionBindings.get(sessionId);
    if (!binding || !sessionManager.isSessionActive(sessionId)) return false;
    if (binding.ws && binding.ws !== ws) {
      binding.ws.data.activeSessionId = null;
    }
    binding.ws = ws;
    ws.data.activeSessionId = sessionId;
    clearDisconnectTimer(sessionId);
    flushQueuedMessages(binding);
    if (binding.timer || binding.text.size > 0 || binding.thinking.size > 0 || binding.toolInput.size > 0) {
      if (binding.timer) {
        clearTimeout(binding.timer);
      }
      flushDeltaBuffer(binding);
    }
    replayPendingPermissions(ws, sessionId);
    void sendCapabilities(ws, sessionId);
    return true;
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

          if (payload.resumeSessionId && sessionManager.isSessionActive(payload.resumeSessionId)) {
            send(ws, {
              type: "error",
              payload: { message: "Session is still processing. Reattach before sending another message." },
            });
            return;
          }

          try {
            if (
              ws.data.activeSessionId &&
              ws.data.activeSessionId !== payload.resumeSessionId &&
              sessionManager.isSessionActive(ws.data.activeSessionId)
            ) {
              send(ws, {
                type: "error",
                payload: { message: "A session is already processing on this connection. Interrupt or abort it first." },
              });
              return;
            }

            const cwd = payload.cwd || process.cwd();
            const resolvedPrompt = await sessionManager.resolvePrompt(payload.prompt, cwd);

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
            if (payload.resumeSessionId) clearDisconnectTimer(payload.resumeSessionId);

            let sessionId = payload.resumeSessionId || "";
            const binding = createSessionBinding(ws);
            sessionId = await sessionManager.startSession(
              resolvedPrompt,
              cwd,
              (msg) => forwardSDKMessage(binding, msg as SDKMessage, sessionId),
              () => {
                if (binding.ws?.data.activeSessionId === sessionId) {
                  binding.ws.data.activeSessionId = null;
                }
                clearDisconnectTimer(sessionId);
                sessionBindings.delete(sessionId);
                send(binding.ws, {
                  type: "chat_complete",
                  payload: { sessionId },
                });
                void sendCapabilities(binding.ws, sessionId);
              },
              (err) => {
                if (binding.ws?.data.activeSessionId === sessionId) {
                  binding.ws.data.activeSessionId = null;
                }
                clearDisconnectTimer(sessionId);
                sessionBindings.delete(sessionId);
                send(binding.ws, {
                  type: "error",
                  payload: { message: err.message },
                });
              },
              (permReq) => {
                send(binding.ws, {
                  type: "permission_request",
                  payload: {
                    sessionId,
                    ...permReq,
                  },
                });
              },
              payload.resumeSessionId,
              sessionOpts
            );

            sessionBindings.set(sessionId, binding);
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

        case "reattach": {
          if (!ws.data.authenticated) return;
          const payload = data.payload as { sessionId?: string };
          if (!payload?.sessionId) {
            send(ws, {
              type: "error",
              payload: { message: "Missing sessionId" },
            });
            return;
          }

          if (!sessionManager.isSessionActive(payload.sessionId)) {
            send(ws, {
              type: "error",
              payload: { message: "Session is no longer active" },
            });
            return;
          }

          if (!attachSession(ws, payload.sessionId)) {
            send(ws, {
              type: "error",
              payload: { message: "Failed to reattach session" },
            });
          }
          break;
        }

        case "set_model": {
          if (!ws.data.authenticated) return;
          const sessionId = ws.data.activeSessionId;
          if (sessionId) {
            try {
              const model = (data.payload as { model: string }).model;
              await sessionManager.setModel(sessionId, model);
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
          const sessionId = ws.data.activeSessionId;
          if (sessionId) {
            try {
              const mode = (data.payload as { mode: string }).mode;
              await sessionManager.setPermissionMode(sessionId, mode);
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
          const payload = (data.payload as { cwd?: string; sessionId?: string } | undefined) ?? {};
          const sessionId = payload.sessionId || ws.data.activeSessionId;
          const sent = sessionId ? await sendCapabilities(ws, sessionId) : false;
          if (!sent) {
            // 无活跃 session 时通过探测获取 capabilities
            try {
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
          const sessionId = ws.data.activeSessionId;
          if (sessionId) {
            await sessionManager.interruptSession(sessionId);
            send(ws, { type: "interrupted", payload: {} });
          }
          break;
        }

        case "abort": {
          if (!ws.data.authenticated) return;
          const sessionId = ws.data.activeSessionId;
          if (sessionId) {
            sessionManager.abortSession(sessionId);
            const binding = sessionBindings.get(sessionId);
            if (binding?.ws?.data.activeSessionId === sessionId) {
              binding.ws.data.activeSessionId = null;
            }
            ws.data.activeSessionId = null;
            sessionBindings.delete(sessionId);
            clearDisconnectTimer(sessionId);
            send(ws, { type: "aborted", payload: {} });
          }
          break;
        }

        case "permission_response": {
          if (!ws.data.authenticated) return;
          const permPayload = data.payload as { requestId: string; behavior: "allow" | "deny"; sessionId?: string };
          const sessionId = permPayload?.sessionId || ws.data.activeSessionId;
          if (sessionId && permPayload?.requestId) {
            sessionManager.resolvePermission(sessionId, permPayload.requestId, permPayload.behavior);
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
        detachSessionFromSocket(ws, activeSessionId);
      }
    },
  };
}

export type { WSState };
