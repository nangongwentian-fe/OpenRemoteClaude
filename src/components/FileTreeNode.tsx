import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File,
  AtSign,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileTreeEntry } from "@/types/messages";

const FILE_ICONS: Record<string, typeof FileCode> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
  py: FileCode, rs: FileCode, go: FileCode, java: FileCode,
  rb: FileCode, c: FileCode, cpp: FileCode, cs: FileCode,
  vue: FileCode, svelte: FileCode,
  json: FileJson,
  md: FileText, txt: FileText, yaml: FileText, yml: FileText,
  toml: FileText, xml: FileText, html: FileText, css: FileText,
  scss: FileText, less: FileText,
};

function getFileIcon(entry: FileTreeEntry) {
  if (entry.isDirectory) return null; // handled separately
  return FILE_ICONS[entry.extension] || File;
}

interface Props {
  entry: FileTreeEntry;
  path: string; // full path to this entry
  parentPath: string;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  onToggleExpand: (path: string) => void;
  onFileSelect: (path: string) => void;
  onAddFileReference: (path: string, name: string) => void;
  onAddFolderReference: (path: string, name: string) => void;
  onDeleteFile: (path: string, parentPath: string) => void;
  onDeleteFolder: (path: string, parentPath: string) => void;
  children?: React.ReactNode;
}

export function FileTreeNode({
  entry,
  path,
  parentPath,
  depth,
  isExpanded,
  isLoading,
  onToggleExpand,
  onFileSelect,
  onAddFileReference,
  onAddFolderReference,
  onDeleteFile,
  onDeleteFolder,
  children,
}: Props) {
  const [showActions, setShowActions] = useState(false);

  const handleClick = () => {
    if (entry.isDirectory) {
      onToggleExpand(path);
    } else {
      onFileSelect(path);
    }
  };

  const handleRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.isDirectory) {
      onAddFolderReference(path, entry.name);
    } else {
      onAddFileReference(path, entry.name);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.isDirectory) {
      onDeleteFolder(path, parentPath);
    } else {
      onDeleteFile(path, parentPath);
    }
  };

  const Icon = entry.isDirectory
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(entry)!;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-1.5 rounded-md cursor-pointer group/node transition-colors",
          "hover:bg-(--color-overlay-hover)"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Chevron for directories */}
        {entry.isDirectory ? (
          <div className="size-4 shrink-0 flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight
                className={cn(
                  "size-3 text-muted-foreground/60 transition-transform duration-150",
                  isExpanded && "rotate-90"
                )}
              />
            )}
          </div>
        ) : (
          <div className="size-4 shrink-0" />
        )}

        {/* Icon */}
        <Icon
          className={cn(
            "size-4 shrink-0",
            entry.isDirectory
              ? "text-primary/70"
              : "text-muted-foreground/70"
          )}
        />

        {/* Name */}
        <span className="text-[13px] truncate flex-1 min-w-0 text-foreground/90">
          {entry.name}
        </span>

        {/* Action buttons on hover */}
        {showActions && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleRef}
              className="size-5 rounded flex items-center justify-center hover:bg-(--color-overlay) text-muted-foreground/50 hover:text-primary transition-colors"
              title="Add reference"
            >
              <AtSign className="size-3" />
            </button>
            <button
              onClick={handleDelete}
              className="size-5 rounded flex items-center justify-center hover:bg-(--color-overlay) text-muted-foreground/50 hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children (expanded directory contents) */}
      {entry.isDirectory && isExpanded && children}
    </div>
  );
}
