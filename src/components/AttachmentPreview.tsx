import { X, FileText, Loader2 } from "lucide-react";
import type { Attachment } from "@/types/messages";

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto scrollbar-none">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative shrink-0 group"
        >
          {att.type.startsWith("image/") && att.preview ? (
            <img
              src={att.preview}
              alt={att.name}
              className="size-12 rounded-lg object-cover border border-(--color-overlay-border)"
            />
          ) : (
            <div className="size-12 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) flex flex-col items-center justify-center gap-0.5">
              <FileText className="size-4 text-muted-foreground/60" />
              <span className="text-[8px] text-muted-foreground/50 max-w-[40px] truncate">
                {att.name.split(".").pop()}
              </span>
            </div>
          )}

          {/* 上传状态 */}
          {att.uploadStatus === "uploading" && (
            <div className="absolute inset-0 rounded-lg bg-background/60 flex items-center justify-center">
              <Loader2 className="size-4 text-primary animate-spin" />
            </div>
          )}
          {att.uploadStatus === "error" && (
            <div className="absolute inset-0 rounded-lg bg-destructive/10 flex items-center justify-center">
              <span className="text-[9px] text-destructive font-medium">Error</span>
            </div>
          )}

          {/* 删除按钮 */}
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="absolute -top-1 -right-1 size-4 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
