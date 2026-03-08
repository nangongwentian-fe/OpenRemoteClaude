import type { ChatMessage } from "../types/messages";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  onPermissionRespond?: (requestId: string, behavior: "allow" | "deny") => void;
}

export function MessageList({ messages, onPermissionRespond }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} onPermissionRespond={onPermissionRespond} />
      ))}
    </div>
  );
}
