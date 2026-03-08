import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  DisplayBlock,
  ServerMessage,
  AttachmentInfo,
} from "../types/messages";

export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const streamingRef = useRef<{
    blocks: DisplayBlock[];
    toolInputs: Map<number, string>;
    finalizedBlocks: DisplayBlock[];
  }>({ blocks: [], toolInputs: new Map(), finalizedBlocks: [] });
  const rafIdRef = useRef<number>(0);
  const pendingBlocksRef = useRef<DisplayBlock[] | null>(null);

  const addUserMessage = useCallback((prompt: string, attachments?: AttachmentInfo[]) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", text: prompt }],
      timestamp: Date.now(),
      attachments: attachments?.length ? attachments : undefined,
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "chat_started": {
        setIsProcessing(true);
        streamingRef.current = { blocks: [], toolInputs: new Map(), finalizedBlocks: [] };
        // 创建一个空的 assistant 消息占位
        const placeholder: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          blocks: [],
          timestamp: Date.now(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, placeholder]);
        break;
      }

      case "stream_delta": {
        const { text, blockIndex } = msg.payload;
        streamingRef.current.blocks[blockIndex] =
          streamingRef.current.blocks[blockIndex] || { type: "text", text: "" };
        const block = streamingRef.current.blocks[blockIndex];
        if (block.type === "text") {
          block.text += text;
        }
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }

      case "thinking_start": {
        const { blockIndex } = msg.payload;
        streamingRef.current.blocks[blockIndex] = {
          type: "thinking",
          thinking: "",
          collapsed: false,
        };
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }

      case "thinking_delta": {
        const { thinking, blockIndex } = msg.payload;
        const thinkBlock = streamingRef.current.blocks[blockIndex];
        if (thinkBlock?.type === "thinking") {
          thinkBlock.thinking += thinking;
        }
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }

      case "tool_start": {
        const { id, name, blockIndex } = msg.payload;
        streamingRef.current.blocks[blockIndex] = {
          type: "tool_use",
          id,
          name,
          input: "",
          collapsed: false,
        };
        streamingRef.current.toolInputs.set(blockIndex, "");
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }

      case "tool_input_delta": {
        const { delta, blockIndex } = msg.payload;
        const current =
          streamingRef.current.toolInputs.get(blockIndex) || "";
        const updated = current + delta;
        streamingRef.current.toolInputs.set(blockIndex, updated);
        const toolBlock = streamingRef.current.blocks[blockIndex];
        if (toolBlock?.type === "tool_use") {
          toolBlock.input = updated;
        }
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }

      case "assistant_message": {
        // 完整的 assistant 消息，用它来补充工具结果等信息
        const blocks: DisplayBlock[] = msg.payload.content.map((block) => {
          if (block.type === "text")
            return { type: "text" as const, text: block.text };
          if (block.type === "thinking")
            return {
              type: "thinking" as const,
              thinking: block.thinking,
              collapsed: true,
            };
          if (block.type === "tool_use")
            return {
              type: "tool_use" as const,
              id: block.id,
              name: block.name,
              input:
                typeof block.input === "string"
                  ? block.input
                  : JSON.stringify(block.input, null, 2),
              collapsed: true,
            };
          if (block.type === "tool_result") {
            // 同步更新 finalizedBlocks 中对应的 tool_use
            const resultContent =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
            for (const fb of streamingRef.current.finalizedBlocks) {
              if (fb.type === "tool_use" && fb.id === block.tool_use_id) {
                fb.result = resultContent;
                fb.isError = block.is_error;
              }
            }
            // 同时更新已渲染的消息
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                const updatedBlocks = last.blocks.map((b) => {
                  if (b.type === "tool_use" && b.id === block.tool_use_id) {
                    return { ...b, result: resultContent, isError: block.is_error };
                  }
                  return b;
                });
                updated[updated.length - 1] = { ...last, blocks: updatedBlocks };
              }
              return updated;
            });
            return null;
          }
          return { type: "text" as const, text: "[unknown block]" };
        }).filter(Boolean) as DisplayBlock[];

        if (blocks.length > 0) {
          // 将已完成轮次的 blocks 追加到 finalizedBlocks，重置流式 blocks
          streamingRef.current.finalizedBlocks = [
            ...streamingRef.current.finalizedBlocks,
            ...blocks,
          ];
          streamingRef.current.blocks = [];
          streamingRef.current.toolInputs = new Map();

          const allBlocks = [...streamingRef.current.finalizedBlocks];
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].isStreaming) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                blocks: allBlocks,
                isStreaming: true,
              };
            } else {
              updated.push({
                id: crypto.randomUUID(),
                role: "assistant",
                blocks: allBlocks,
                timestamp: Date.now(),
                isStreaming: true,
              });
            }
            return updated;
          });
        }
        break;
      }

      case "system_init": {
        setCurrentSessionId(msg.payload.sessionId);
        break;
      }

      case "result":
      case "chat_complete": {
        setIsProcessing(false);
        // 取消未执行的 rAF，确保最终状态一致
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = 0;
          pendingBlocksRef.current = null;
        }
        streamingRef.current = { blocks: [], toolInputs: new Map(), finalizedBlocks: [] };
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              isStreaming: false,
            };
          }
          return updated;
        });
        break;
      }

      case "error": {
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            blocks: [{ type: "text", text: `Error: ${msg.payload.message}` }],
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case "permission_request": {
        const { requestId, toolName, input, decisionReason, description } = msg.payload;
        const permBlock: DisplayBlock = {
          type: "permission_request",
          requestId,
          toolName,
          input,
          status: "pending",
          decisionReason,
          description,
        };
        streamingRef.current.blocks.push(permBlock);
        updateLastAssistant(streamingRef.current.blocks);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLastAssistant(blocks: DisplayBlock[]) {
    pendingBlocksRef.current = blocks;

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        const pending = pendingBlocksRef.current;
        if (!pending) return;
        pendingBlocksRef.current = null;

        const finalized = streamingRef.current.finalizedBlocks;
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx < 0 || prev[lastIdx].role !== "assistant") return prev;

          const updated = [...prev];
          updated[lastIdx] = {
            ...prev[lastIdx],
            blocks: [...finalized, ...pending.filter(Boolean)],
          };
          return updated;
        });
      });
    }
  }

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsProcessing(false);
    setCurrentSessionId(null);
  }, []);

  const updatePermissionStatus = useCallback(
    (requestId: string, status: "allowed" | "denied") => {
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          const msg = updated[i];
          const blockIdx = msg.blocks.findIndex(
            (b) => b.type === "permission_request" && b.requestId === requestId
          );
          if (blockIdx !== -1) {
            const newBlocks = [...msg.blocks];
            const block = newBlocks[blockIdx];
            if (block.type === "permission_request") {
              newBlocks[blockIdx] = { ...block, status };
            }
            updated[i] = { ...msg, blocks: newBlocks };
            break;
          }
        }
        return updated;
      });
    },
    []
  );

  // 从历史消息文本中提取附件信息
  function parseAttachmentsFromText(text: string): {
    cleanText: string;
    attachments: AttachmentInfo[];
  } {
    const pattern = /\n\n\[Attached files:\n([\s\S]*?)\n\]$/;
    const match = text.match(pattern);
    if (!match) return { cleanText: text, attachments: [] };

    const cleanText = text.replace(pattern, "");
    const lines = match[1].split("\n").filter((l) => l.startsWith("- "));
    const extToMime: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      txt: "text/plain",
      ts: "text/typescript",
      tsx: "text/typescript",
      js: "text/javascript",
      json: "application/json",
    };

    const attachments: AttachmentInfo[] = lines.map((line) => {
      const serverPath = line.slice(2).trim();
      const serverFileName = serverPath.split("/").pop() || serverPath;
      // 去掉 UUID 前缀 (格式: uuid-originalname)
      const nameParts = serverFileName.split("-");
      const name =
        nameParts.length > 5
          ? nameParts.slice(5).join("-")
          : serverFileName;
      const ext = name.split(".").pop()?.toLowerCase() || "";
      return {
        name,
        mimeType: extToMime[ext] || "application/octet-stream",
        serverPath,
        serverFileName,
      };
    });

    return { cleanText, attachments };
  }

  // 加载历史消息（从 SDK SessionMessage[] 转换为 ChatMessage[]）
  const loadHistoryMessages = useCallback(
    (rawMessages: Array<{ type: string; uuid: string; message: unknown }>) => {
      const converted: ChatMessage[] = [];
      for (const raw of rawMessages) {
        if (raw.type === "user") {
          const msg = raw.message as Record<string, unknown>;
          const content = msg?.content;
          let text = "";
          if (typeof content === "string") {
            text = content;
          } else if (Array.isArray(content)) {
            text = content
              .filter((b: Record<string, unknown>) => b.type === "text")
              .map((b: Record<string, unknown>) => b.text)
              .join("");
          }
          if (text) {
            const { cleanText, attachments } = parseAttachmentsFromText(text);
            converted.push({
              id: raw.uuid,
              role: "user",
              blocks: [{ type: "text", text: cleanText }],
              timestamp: Date.now(),
              attachments: attachments.length ? attachments : undefined,
            });
          }
        } else if (raw.type === "assistant") {
          const msg = raw.message as Record<string, unknown>;
          const content = msg?.content;
          if (Array.isArray(content)) {
            const blocks: DisplayBlock[] = [];
            for (const block of content as Record<string, unknown>[]) {
              if (block.type === "text" && block.text) {
                blocks.push({ type: "text", text: block.text as string });
              } else if (block.type === "thinking" && block.thinking) {
                blocks.push({
                  type: "thinking",
                  thinking: block.thinking as string,
                  collapsed: true,
                });
              } else if (block.type === "tool_use") {
                blocks.push({
                  type: "tool_use",
                  id: block.id as string,
                  name: block.name as string,
                  input:
                    typeof block.input === "string"
                      ? block.input
                      : JSON.stringify(block.input, null, 2),
                  collapsed: true,
                });
              }
            }
            if (blocks.length > 0) {
              converted.push({
                id: raw.uuid,
                role: "assistant",
                blocks,
                timestamp: Date.now(),
              });
            }
          }
        }
      }
      setMessages(converted);
      setIsProcessing(false);
    },
    []
  );

  return {
    messages,
    isProcessing,
    currentSessionId,
    addUserMessage,
    handleServerMessage,
    clearMessages,
    loadHistoryMessages,
    updatePermissionStatus,
  };
}
