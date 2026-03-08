import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

interface Props {
  onAddAttachments: (files: FileList) => void;
  disabled?: boolean;
}

export function AttachmentButton({ onAddAttachments, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center size-7 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Paperclip className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Attach files</TooltipContent>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.hpp,.rb,.sh,.sql,.html,.css"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddAttachments(e.target.files);
            e.target.value = "";
          }
        }}
      />
    </>
  );
}
