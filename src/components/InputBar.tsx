import { useState, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  onSend: (prompt: string) => void;
  onInterrupt: () => void;
  isProcessing: boolean;
  disabled: boolean;
}

export function InputBar({ onSend, onInterrupt, isProcessing, disabled }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))] bg-card/95 backdrop-blur-md border-t border-(--color-overlay-border)">
      <div className="flex items-end gap-2 bg-background/80 border border-(--color-overlay-border) rounded-2xl py-2 pl-4 pr-2 focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Connecting..." : "Send a message..."}
          disabled={disabled || isProcessing}
          rows={1}
          className="flex-1 min-w-0 bg-transparent border-none text-foreground font-sans text-[15px] resize-none outline-none max-h-30 leading-relaxed py-1 placeholder:text-muted-foreground/60"
        />
        {isProcessing ? (
          <Button
            variant="destructive"
            size="icon"
            className="rounded-full shrink-0 size-9 shadow-md"
            onClick={onInterrupt}
            title="Stop"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="rounded-full shrink-0 size-9 shadow-md shadow-primary/20 transition-all duration-200"
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            title="Send"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
