import type { ChatMessage, DisplayBlock } from "../types/messages";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
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
          <BlockRenderer key={i} block={block} />
        ))}
        {message.isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: DisplayBlock }) {
  switch (block.type) {
    case "text":
      return <TextContent text={block.text} />;
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

function TextContent({ text }: { text: string }) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="leading-relaxed wrap-break-word">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0] || "";
          const code = lines.slice(1).join("\n") || lines.join("\n");
          return (
            <pre key={i} className="bg-(--color-code-bg) backdrop-blur-sm rounded-xl p-3.5 my-2.5 overflow-x-auto font-mono text-[13px] leading-normal border border-(--color-code-border)">
              {lang && <div className="text-muted-foreground/60 text-[11px] mb-2 font-sans font-medium uppercase tracking-wider">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((p, j) =>
              p.startsWith("`") && p.endsWith("`") ? (
                <code key={j} className="bg-(--color-code-bg) px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-(--color-code-border)">
                  {p.slice(1, -1)}
                </code>
              ) : (
                <span key={j} className="whitespace-pre-wrap">{p}</span>
              )
            )}
          </span>
        );
      })}
    </div>
  );
}
