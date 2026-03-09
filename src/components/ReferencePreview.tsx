import { X, FileCode, Folder, Hash } from "lucide-react";
import type { FileReference } from "@/types/messages";

interface Props {
  references: FileReference[];
  onRemove: (id: string) => void;
}

function getLabel(ref: FileReference): string {
  if (ref.type === "code_snippet") {
    return `${ref.name}:L${ref.startLine}-${ref.endLine}`;
  }
  return ref.name;
}

function getIcon(ref: FileReference) {
  switch (ref.type) {
    case "file": return FileCode;
    case "folder": return Folder;
    case "code_snippet": return Hash;
  }
}

export function ReferencePreview({ references, onRemove }: Props) {
  if (references.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
      {references.map((ref) => {
        const Icon = getIcon(ref);
        return (
          <div
            key={ref.id}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-(--color-overlay) border border-(--color-overlay-border) text-xs text-foreground/80 max-w-[200px] group"
          >
            <Icon className="size-3 shrink-0 text-primary/70" />
            <span className="truncate">{getLabel(ref)}</span>
            <button
              onClick={() => onRemove(ref.id)}
              className="size-3.5 rounded-sm flex items-center justify-center shrink-0 text-muted-foreground/40 hover:text-destructive hover:bg-(--color-overlay-hover) transition-colors ml-0.5 cursor-pointer"
            >
              <X className="size-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
