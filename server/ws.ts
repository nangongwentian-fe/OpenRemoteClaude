import { verify } from "hono/jwt";
import { ClaudeSessionManager } from "./claude";
import { DataStore } from "./db";
import type { ServerWebSocket } from "bun";

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
        send(ws, {
          type: "system_init",
          payload: {
            sessionId: msg.session_id,
            tools: msg.tools,
          },
        });
      }
      break;
    }
  }
}

export function createWSHandlers(jwtSecret: string, db: DataStore) {
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
          };

          if (!payload?.prompt) {
            send(ws, {
              type: "error",
              payload: { message: "Missing prompt" },
            });
            return;
          }

          const cwd = payload.cwd || process.cwd();

          send(ws, { type: "chat_started", payload: { cwd } });

          try {
            const sessionId = await sessionManager.startSession(
              payload.prompt,
              cwd,
              (msg) => forwardSDKMessage(ws, msg as SDKMessage),
              () => {
                ws.data.activeSessionId = null;
                send(ws, {
                  type: "chat_complete",
                  payload: { sessionId },
                });
              },
              (err) => {
                ws.data.activeSessionId = null;
                send(ws, {
                  type: "error",
                  payload: { message: err.message },
                });
              },
              payload.resumeSessionId
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

        case "interrupt": {
          if (!ws.data.authenticated) return;
          const activeSession = sessionManager.getActiveSession();
          if (activeSession) {
            await sessionManager.interruptSession(activeSession.id);
            send(ws, { type: "interrupted", payload: {} });
          }
          break;
        }

        case "abort": {
          if (!ws.data.authenticated) return;
          const active = sessionManager.getActiveSession();
          if (active) {
            sessionManager.abortSession(active.id);
            send(ws, { type: "aborted", payload: {} });
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
      // 连接断开时不中断 Claude 会话（可能只是网络抖动）
      console.log(`[WS] Client disconnected: ${ws.data.clientId}`);
    },
  };
}

export type { WSState };
