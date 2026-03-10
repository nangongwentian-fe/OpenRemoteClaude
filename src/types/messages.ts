// WebSocket 协议消息类型

// SDK 能力类型
export type EffortLevel = "low" | "medium" | "high" | "max";
export type ThinkingMode = "adaptive" | "enabled" | "disabled";
export type PermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk";

export interface ModelInfo {
  value: string;
  displayName: string;
  description?: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: EffortLevel[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
}

export interface McpServerInfo {
  name: string;
  status: string;
}

export interface SlashCommandInfo {
  name: string;
  description?: string;
  argumentHint?: string;
}

export interface SessionPreferences {
  model?: string;
  effort?: EffortLevel;
  thinking?: ThinkingMode;
  permissionMode?: PermissionMode;
}

export interface Attachment {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  preview?: string;
  uploadStatus: "pending" | "uploading" | "done" | "error";
  serverPath?: string;
}

export interface AttachmentInfo {
  name: string;
  mimeType: string;
  serverPath: string;
  serverFileName: string;
}

// 客户端 → 服务端
export type ClientMessage =
  | { type: "auth"; token: string }
  | {
      type: "chat";
      payload: {
        prompt: string;
        cwd?: string;
        resumeSessionId?: string;
        model?: string;
        effort?: EffortLevel;
        thinking?: ThinkingMode;
        permissionMode?: PermissionMode;
      };
    }
  | { type: "reattach"; payload: { sessionId: string } }
  | { type: "interrupt" }
  | { type: "abort" }
  | { type: "ping" }
  | { type: "set_model"; payload: { model: string } }
  | { type: "set_permission_mode"; payload: { mode: PermissionMode } }
  | { type: "request_capabilities"; payload?: { cwd?: string; sessionId?: string } }
  | { type: "permission_response"; payload: { requestId: string; behavior: "allow" | "deny"; sessionId?: string } };

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
  | {
      type: "system_init";
      payload: {
        sessionId: string;
        tools: string[];
        model?: string;
        permissionMode?: PermissionMode;
        mcpServers?: McpServerInfo[];
        slashCommands?: string[];
        skills?: string[];
      };
    }
  | {
      type: "capabilities";
      payload: {
        models: ModelInfo[];
        commands: SlashCommandInfo[];
        mcpServers: McpServerInfo[];
      };
    }
  | { type: "model_changed"; payload: { model: string } }
  | { type: "permission_mode_changed"; payload: { mode: PermissionMode } }
  | { type: "chat_complete"; payload: { sessionId: string } }
  | { type: "interrupted"; payload: Record<string, never> }
  | { type: "aborted"; payload: Record<string, never> }
  | { type: "error"; payload: { message: string } }
  | { type: "pong" }
  | {
      type: "permission_request";
      payload: {
        sessionId: string;
        requestId: string;
        toolName: string;
        input: Record<string, unknown>;
        decisionReason?: string;
        description?: string;
      };
    };

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
  attachments?: AttachmentInfo[];
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
    }
  | {
      type: "permission_request";
      sessionId: string;
      requestId: string;
      toolName: string;
      input: Record<string, unknown>;
      status: "pending" | "allowed" | "denied";
      decisionReason?: string;
      description?: string;
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

// 项目类型
export interface Project {
  path: string;
  name: string;
  addedAt: number;
}

// 文件树条目（API 返回）
export interface FileTreeEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  extension: string;
}

// 文件引用类型
export type FileReference =
  | { type: "file"; id: string; path: string; name: string }
  | { type: "folder"; id: string; path: string; name: string }
  | {
      type: "code_snippet";
      id: string;
      path: string;
      name: string;
      startLine: number;
      endLine: number;
      content: string;
    };

// 分布式 Omit 以保持 union 的 discriminated 性质
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewFileReference = DistributiveOmit<FileReference, "id">;

// 文件内容（API 返回）
export interface FileContent {
  path: string;
  name: string;
  content: string;
  language: string;
  lineCount: number;
}
