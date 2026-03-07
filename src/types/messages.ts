// WebSocket 协议消息类型

// 客户端 → 服务端
export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "chat"; payload: { prompt: string; cwd?: string; resumeSessionId?: string } }
  | { type: "interrupt" }
  | { type: "abort" }
  | { type: "ping" };

// 服务端 → 客户端
export type ServerMessage =
  | { type: "status"; payload: { connected: boolean; needsAuth: boolean } }
  | { type: "auth_result"; payload: { success: boolean; error?: string } }
  | { type: "chat_started"; payload: { cwd: string } }
  | { type: "stream_delta"; payload: { text: string; blockIndex: number } }
  | {
      type: "thinking_delta";
      payload: { thinking: string; blockIndex: number };
    }
  | { type: "thinking_start"; payload: { blockIndex: number } }
  | {
      type: "tool_start";
      payload: { id: string; name: string; blockIndex: number };
    }
  | {
      type: "tool_input_delta";
      payload: { delta: string; blockIndex: number };
    }
  | { type: "block_stop"; payload: { blockIndex: number } }
  | {
      type: "assistant_message";
      payload: { content: ContentBlock[]; model: string };
    }
  | {
      type: "result";
      payload: {
        sessionId: string;
        durationMs: number;
        isError: boolean;
        numTurns: number;
      };
    }
  | { type: "system_init"; payload: { sessionId: string; tools: string[] } }
  | { type: "chat_complete"; payload: { sessionId: string } }
  | { type: "interrupted"; payload: Record<string, never> }
  | { type: "aborted"; payload: Record<string, never> }
  | { type: "error"; payload: { message: string } }
  | { type: "pong" };

// 内容块类型
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: "thinking"; thinking: string };

// 聊天消息（前端展示用）
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: DisplayBlock[];
  timestamp: number;
  isStreaming?: boolean;
}

export type DisplayBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; collapsed: boolean }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: string;
      result?: string;
      isError?: boolean;
      collapsed: boolean;
    };

// 连接状态
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "authenticated";

// Thread 类型
export interface Thread {
  id: string;
  title: string;
  firstPrompt?: string;
  lastModified: number;
  cwd?: string;
}
