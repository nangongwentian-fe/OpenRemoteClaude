import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "./ui/button";
import { ModelChip } from "./ModelChip";
import { EffortChip } from "./EffortChip";
import { ThinkingChip } from "./ThinkingChip";
import { McpStatusChip } from "./McpStatusChip";
import { PermissionModeChip } from "./PermissionModeChip";
import { SlashCommandButton } from "./SlashCommandButton";
import { SlashCommandPanel } from "./SlashCommandPanel";
import { AttachmentButton } from "./AttachmentButton";
import { AttachmentPreview } from "./AttachmentPreview";
import { ReferencePreview } from "./ReferencePreview";
import { TooltipProvider } from "./ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ModelInfo,
  McpServerInfo,
  SlashCommandInfo,
  SessionPreferences,
  PermissionMode,
  Attachment,
  FileReference,
} from "@/types/messages";

interface Props {
  onSend: (prompt: string) => void;
  onInterrupt: () => void;
  isProcessing: boolean;
  disabled: boolean;
  // 能力与偏好
  preferences: SessionPreferences;
  onUpdatePreference: <K extends keyof SessionPreferences>(key: K, value: SessionPreferences[K]) => void;
  models: ModelInfo[];
  commands: SlashCommandInfo[];
  mcpServers: McpServerInfo[];
  currentModel: string;
  onSetModel: (model: string) => void;
  // 权限模式
  currentPermissionMode: PermissionMode;
  onSetPermissionMode: (mode: PermissionMode) => void;
  // 附件
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  // 引用
  references?: FileReference[];
  onRemoveReference?: (id: string) => void;
}

export function InputBar({
  onSend,
  onInterrupt,
  isProcessing,
  disabled,
  preferences,
  onUpdatePreference,
  models,
  commands,
  mcpServers,
  currentModel,
  onSetModel,
  currentPermissionMode,
  onSetPermissionMode,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  references,
  onRemoveReference,
}: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Slash command panel state
  const [showPanel, setShowPanel] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashFilter, setSlashFilter] = useState("");

  // JS fallback for browsers that don't support field-sizing: content
  // 使用 RAF 节流避免每次击键都触发 reflow
  const heightRafRef = useRef<number>(0);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && !CSS.supports("field-sizing", "content")) {
      if (heightRafRef.current) cancelAnimationFrame(heightRafRef.current);
      heightRafRef.current = requestAnimationFrame(() => {
        heightRafRef.current = 0;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 192) + "px";
      });
    }
  }, [text]);

  // Cleanup blur timeout and height RAF
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      if (heightRafRef.current) cancelAnimationFrame(heightRafRef.current);
    };
  }, []);

  const filteredCommands = useMemo(() => {
    if (!showPanel) return [];
    const lower = slashFilter.toLowerCase();
    if (!lower) return commands;
    return commands
      .filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lower) ||
          cmd.description?.toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        return aStarts - bStarts;
      });
  }, [commands, slashFilter, showPanel]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    setShowPanel(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const selectCommand = useCallback((cmd: SlashCommandInfo) => {
    setText(`/${cmd.name} `);
    setShowPanel(false);
    textareaRef.current?.focus();
  }, []);

  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText);

      if (newText.startsWith("/") && commands.length > 0) {
        const afterSlash = newText.slice(1);
        // 如果 "/" 后有空格，用户已完成命令输入，关闭面板
        if (afterSlash.includes(" ")) {
          setShowPanel(false);
        } else {
          setSlashFilter(afterSlash);
          setSelectedIndex(0);
          setShowPanel(true);
        }
      } else {
        setShowPanel(false);
      }
    },
    [commands.length]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;

      // Slash command panel navigation
      if (showPanel && filteredCommands.length > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex(
              (prev) => (prev + 1) % filteredCommands.length
            );
            return;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex(
              (prev) =>
                (prev - 1 + filteredCommands.length) % filteredCommands.length
            );
            return;
          case "Enter":
          case "Tab":
            e.preventDefault();
            selectCommand(filteredCommands[selectedIndex]);
            return;
          case "Escape":
            e.preventDefault();
            setShowPanel(false);
            return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showPanel, filteredCommands, selectedIndex, selectCommand, handleSubmit]
  );

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => setShowPanel(false), 150);
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = undefined;
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      onAddAttachments(dt.files);
    }
  }, [onAddAttachments]);

  const handleSlashCommand = useCallback((command: string) => {
    setText((prev) => {
      const prefix = `/${command} `;
      return prev ? `${prefix}${prev}` : prefix;
    });
    textareaRef.current?.focus();
  }, []);

  // 当前模型支持的 effort levels
  const currentModelInfo = models.find((m) => m.value === currentModel);

  const canSubmit = text.trim().length > 0 && !disabled;

  return (
    <div className="px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-xl border-t border-(--color-overlay-border)">
      <div className="relative">
        {/* Slash Command Panel */}
        {showPanel && filteredCommands.length > 0 && (
          <SlashCommandPanel
            commands={filteredCommands}
            selectedIndex={selectedIndex}
            onSelect={selectCommand}
          />
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className={cn(
            "relative rounded-2xl border bg-card/60 overflow-hidden",
            "transition-[border-color,box-shadow] duration-200",
            "border-(--color-overlay-border)",
            "focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10"
          )}
        >
          {/* 附件预览区 */}
          <AttachmentPreview
            attachments={attachments}
            onRemove={onRemoveAttachment}
          />

          {/* 引用预览区 */}
          {references && onRemoveReference && (
            <ReferencePreview
              references={references}
              onRemove={onRemoveReference}
            />
          )}

          {/* Body: textarea */}
          <div className="px-4 pt-3 pb-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={handleFocus}
              onPaste={handlePaste}
              placeholder={disabled ? "Connecting..." : "Message Claude Code..."}
              disabled={disabled}
              rows={1}
              aria-label="Message input"
              className={cn(
                "w-full bg-transparent text-foreground font-sans text-[15px]",
                "resize-none outline-none leading-relaxed",
                "placeholder:text-muted-foreground/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "field-sizing-content max-h-48 min-h-[1.5rem]"
              )}
            />
          </div>

          {/* Footer: toolbar */}
          <TooltipProvider>
            <div className="flex items-center gap-2 px-2 py-1.5">
              {/* 左侧：设置 chips */}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-none whitespace-nowrap">
                <ModelChip
                  currentModel={currentModel}
                  models={models}
                  onSelect={onSetModel}
                  disabled={isProcessing}
                />
                <EffortChip
                  effort={preferences.effort}
                  supportedLevels={currentModelInfo?.supportedEffortLevels}
                  onSelect={(e) => onUpdatePreference("effort", e)}
                />
                <ThinkingChip
                  thinking={preferences.thinking}
                  onSelect={(m) => onUpdatePreference("thinking", m)}
                />
                <McpStatusChip servers={mcpServers} />
                <PermissionModeChip
                  mode={currentPermissionMode}
                  onSelect={onSetPermissionMode}
                  disabled={isProcessing}
                />
              </div>

              {/* 右侧：操作按钮 */}
              <div className="flex shrink-0 items-center gap-1">
                <AttachmentButton
                  onAddAttachments={onAddAttachments}
                  disabled={disabled}
                />
                <SlashCommandButton
                  commands={commands}
                  onSelect={handleSlashCommand}
                />
                {isProcessing ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    className="rounded-full animate-scale-in"
                    onClick={onInterrupt}
                    aria-label="Stop generating"
                  >
                    <Square className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon-sm"
                    className={cn(
                      "rounded-full transition-all duration-200 animate-scale-in",
                      canSubmit ? "shadow-md shadow-primary/20" : "opacity-50"
                    )}
                    disabled={!canSubmit}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </TooltipProvider>
        </form>
      </div>
    </div>
  );
}
