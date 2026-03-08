import type { ChatMessage, DisplayBlock } from "../types/messages";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 max-w-full ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <Avatar className="size-8 shrink-0 mt-1">
          <AvatarFallback className="bg-linear-to-br from-primary/80 to-primary text-primary-foreground text-xs font-bold">
            C
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md max-w-[85%] shadow-md shadow-primary/10"
            : "bg-(--color-assistant-bubble) border border-(--color-assistant-bubble-border) rounded-bl-md max-w-[90%] min-w-0 overflow-hidden"
        )}
      >
        {message.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} isUser={isUser} />
        ))}
        {message.isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}

function BlockRenderer({ block, isUser }: { block: DisplayBlock; isUser: boolean }) {
  switch (block.type) {
    case "text":
      return (
        <MarkdownRenderer
          text={block.text}
          variant={isUser ? "user" : "assistant"}
        />
      );
    case "thinking":
      return (
        <ThinkingBlock thinking={block.thinking} collapsed={block.collapsed} />
      );
    case "tool_use":
      return (
        <ToolCallCard
          name={block.name}
          input={block.input}
          result={block.result}
          isError={block.isError}
          collapsed={block.collapsed}
        />
      );
    default:
      return null;
  }
}
