import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  DisplayBlock,
  ServerMessage,
} from "../types/messages";

export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const streamingRef = useRef<{
    blocks: DisplayBlock[];
    toolInputs: Map<number, string>;
  }>({ blocks: [], toolInputs: new Map() });

  const addUserMessage = useCallback((prompt: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", text: prompt }],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "chat_started": {
        setIsProcessing(true);
        streamingRef.current = { blocks: [], toolInputs: new Map() };
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
            // 工具结果需要合并到对应的 tool_use block
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                for (const b of last.blocks) {
                  if (
                    b.type === "tool_use" &&
                    b.id === block.tool_use_id
                  ) {
                    b.result =
                      typeof block.content === "string"
                        ? block.content
                        : JSON.stringify(block.content);
                    b.isError = block.is_error;
                  }
                }
              }
              return updated;
            });
            return null;
          }
          return { type: "text" as const, text: "[unknown block]" };
        }).filter(Boolean) as DisplayBlock[];

        if (blocks.length > 0) {
          // 重置流式状态，用完整消息替换
          streamingRef.current = { blocks: [], toolInputs: new Map() };
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].isStreaming) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                blocks,
                isStreaming: true, // 可能还有更多轮次
              };
            } else {
              updated.push({
                id: crypto.randomUUID(),
                role: "assistant",
                blocks,
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
        streamingRef.current = { blocks: [], toolInputs: new Map() };
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLastAssistant(blocks: DisplayBlock[]) {
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
        updated[lastIdx] = {
          ...updated[lastIdx],
          blocks: blocks.filter(Boolean).map((b) => ({ ...b })),
        };
      }
      return updated;
    });
  }

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsProcessing(false);
    setCurrentSessionId(null);
  }, []);

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
            converted.push({
              id: raw.uuid,
              role: "user",
              blocks: [{ type: "text", text }],
              timestamp: Date.now(),
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
  };
}
