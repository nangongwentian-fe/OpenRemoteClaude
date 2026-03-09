import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import type { ChatMessage, DisplayBlock, AttachmentInfo } from "../types/messages";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { PermissionCard } from "./PermissionCard";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessage;
  onPermissionRespond?: (requestId: string, behavior: "allow" | "deny") => void;
}

function getBlockKey(block: DisplayBlock, index: number): string {
  switch (block.type) {
    case "tool_use": return `tool-${block.id}`;
    case "permission_request": return `perm-${block.requestId}`;
    default: return `${block.type}-${index}`;
  }
}

export const MessageBubble = memo(function MessageBubble({ message, onPermissionRespond }: Props) {
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
          <BlockRenderer key={getBlockKey(block, i)} block={block} isUser={isUser} onPermissionRespond={onPermissionRespond} />
        ))}
        {message.isStreaming && <span className="streaming-cursor" />}
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} isUser={isUser} />
        )}
      </div>
    </div>
  );
});

function BlockRenderer({
  block,
  isUser,
  onPermissionRespond,
}: {
  block: DisplayBlock;
  isUser: boolean;
  onPermissionRespond?: (requestId: string, behavior: "allow" | "deny") => void;
}) {
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
    case "permission_request":
      return (
        <PermissionCard
          requestId={block.requestId}
          toolName={block.toolName}
          input={block.input}
          status={block.status}
          decisionReason={block.decisionReason}
          description={block.description}
          onRespond={onPermissionRespond || (() => {})}
        />
      );
    default:
      return null;
  }
}

function MessageAttachments({
  attachments,
  isUser,
}: {
  attachments: AttachmentInfo[];
  isUser: boolean;
}) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  return (
    <>
      <div className={cn("flex items-center gap-2 mt-2 flex-wrap", isUser ? "justify-end" : "")}>
        {attachments.map((att, i) => {
          const isImage = att.mimeType.startsWith("image/");
          const ext = att.name.split(".").pop()?.toLowerCase() || "";

          return isImage ? (
            <img
              key={i}
              src={`/api/uploads/${att.serverFileName}`}
              alt={att.name}
              className="size-12 rounded-lg object-cover border border-primary-foreground/20 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setPreviewSrc(`/api/uploads/${att.serverFileName}`)}
            />
          ) : (
            <div
              key={i}
              className={cn(
                "size-12 rounded-lg flex flex-col items-center justify-center gap-0.5",
                isUser
                  ? "bg-primary-foreground/15 border border-primary-foreground/20"
                  : "border border-(--color-overlay-border) bg-(--color-overlay)"
              )}
              title={att.name}
            >
              <FileText
                className={cn(
                  "size-4",
                  isUser ? "text-primary-foreground/60" : "text-muted-foreground/60"
                )}
              />
              <span
                className={cn(
                  "text-[8px] max-w-10 truncate",
                  isUser ? "text-primary-foreground/50" : "text-muted-foreground/50"
                )}
              >
                {ext}
              </span>
            </div>
          );
        })}
      </div>

      {previewSrc &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewSrc(null)}
          >
            <button
              className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              onClick={() => setPreviewSrc(null)}
            >
              <X className="size-5 text-white" />
            </button>
            <img
              src={previewSrc}
              alt="Preview"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}
