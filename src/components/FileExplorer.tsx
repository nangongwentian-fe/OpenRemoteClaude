import { useState, useCallback, useEffect, useRef } from "react";
import {
  PanelRight,
  PanelRightClose,
  FilePlus,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { useFileTree } from "@/hooks/useFileTree";
import { useFileViewer } from "@/hooks/useFileViewer";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { cn } from "@/lib/utils";
import type { Project, NewFileReference } from "@/types/messages";

interface Props {
  activeProject: Project | null;
  token: string;
  isPinned: boolean;
  isDesktop: boolean;
  isEffectivelyPinned: boolean;
  onTogglePin: () => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  onAddReference: (ref: NewFileReference) => void;
}

type CreateMode = "file" | "folder" | null;

export function FileExplorer({
  activeProject,
  token,
  isPinned,
  isDesktop,
  isEffectivelyPinned,
  onTogglePin,
  sheetOpen,
  onSheetOpenChange,
  onAddReference,
}: Props) {
  const fileTree = useFileTree(token);
  const fileViewer = useFileViewer(token);
  const [view, setView] = useState<"tree" | "file">("tree");

  const isFileView = view === "file";
  const fileViewMaxWidth = typeof window !== "undefined"
    ? Math.round(window.innerWidth * 0.8)
    : 1200;

  const { width, setWidth, handleMouseDown } = useResizablePanel({
    storageKey: "rcc_explorer_width",
    defaultWidth: 320,
    minWidth: isFileView ? 400 : 240,
    maxWidth: isFileView ? fileViewMaxWidth : 500,
    side: "right",
  });

  const treeWidthRef = useRef(width);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (view === "file") {
      treeWidthRef.current = width;
      setIsTransitioning(true);
      const targetWidth = Math.max(500, Math.round(window.innerWidth * 0.7));
      setWidth(targetWidth);
    } else {
      setIsTransitioning(true);
      setWidth(treeWidthRef.current);
    }
    // Only react to view changes, not width
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [createName, setCreateName] = useState("");
  const [createParent, setCreateParent] = useState<string | null>(null);

  const rootPath = activeProject?.path || null;

  const handleFileSelect = useCallback((path: string) => {
    fileViewer.openFile(path);
    setView("file");
  }, [fileViewer]);

  const handleBackToTree = useCallback(() => {
    fileViewer.closeFile();
    setView("tree");
  }, [fileViewer]);

  const handleAddFileReference = useCallback((path: string, name: string) => {
    onAddReference({ type: "file", path, name });
  }, [onAddReference]);

  const handleAddFolderReference = useCallback((path: string, name: string) => {
    onAddReference({ type: "folder", path, name });
  }, [onAddReference]);

  const handleAddSnippetReference = useCallback((path: string, name: string, startLine: number, endLine: number, content: string) => {
    onAddReference({ type: "code_snippet", path, name, startLine, endLine, content });
  }, [onAddReference]);

  const handleDeleteFile = useCallback(async (filePath: string, parentPath: string) => {
    if (!confirm(`Delete ${filePath.split("/").pop()}?`)) return;
    await fileTree.deleteFile(filePath, parentPath);
    // If the deleted file is currently open, go back to tree
    if (fileViewer.currentFile?.path === filePath) {
      handleBackToTree();
    }
  }, [fileTree, fileViewer.currentFile, handleBackToTree]);

  const handleDeleteFolder = useCallback(async (folderPath: string, parentPath: string) => {
    if (!confirm(`Delete ${folderPath.split("/").pop()}/ and all its contents?`)) return;
    await fileTree.deleteFolder(folderPath, parentPath, true);
  }, [fileTree]);

  const startCreate = useCallback((mode: CreateMode, parentPath?: string) => {
    setCreateMode(mode);
    setCreateName("");
    setCreateParent(parentPath || rootPath);
  }, [rootPath]);

  const handleCreateSubmit = useCallback(async () => {
    const name = createName.trim();
    if (!name || !createParent) return;

    if (createMode === "file") {
      await fileTree.createFile(createParent, name);
    } else if (createMode === "folder") {
      await fileTree.createFolder(createParent, name);
    }
    setCreateMode(null);
    setCreateName("");
  }, [createMode, createName, createParent, fileTree]);

  if (!activeProject) return null;

  const explorerContent = (
    <div className="flex flex-col h-full">
      {view === "tree" ? (
        <>
          {/* Header */}
          <div className={cn(
            "px-3 pb-2 shrink-0",
            isEffectivelyPinned
              ? "pt-[calc(0.75rem+env(safe-area-inset-top,0px))]"
              : "pt-[calc(1rem+env(safe-area-inset-top,0px))] pr-10",
            !isEffectivelyPinned && "pl-3"
          )}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight truncate">
                {activeProject.name}
              </h2>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg hover:bg-(--color-overlay-hover)"
                  onClick={() => startCreate("file")}
                  title="New file"
                >
                  <FilePlus className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg hover:bg-(--color-overlay-hover)"
                  onClick={() => startCreate("folder")}
                  title="New folder"
                >
                  <FolderPlus className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg hover:bg-(--color-overlay-hover)"
                  onClick={() => fileTree.refresh(rootPath || undefined)}
                  title="Refresh"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                {isDesktop && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg hover:bg-(--color-overlay-hover)"
                    onClick={onTogglePin}
                    title={isPinned ? "Unpin panel" : "Pin panel"}
                  >
                    {isPinned ? (
                      <PanelRightClose className="size-3.5" />
                    ) : (
                      <PanelRight className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Create input */}
          {createMode && (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={createMode === "file" ? "File name..." : "Folder name..."}
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit();
                    if (e.key === "Escape") setCreateMode(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={handleCreateSubmit}
                >
                  OK
                </Button>
              </div>
            </div>
          )}

          <Separator className="bg-(--color-overlay-border)" />

          {/* File tree */}
          <ScrollArea className="flex-1">
            {rootPath && (
              <FileTree
                rootPath={rootPath}
                tree={fileTree.tree}
                expandedPaths={fileTree.expandedPaths}
                loadingPaths={fileTree.loadingPaths}
                onLoadDirectory={fileTree.loadDirectory}
                onToggleExpand={fileTree.toggleExpand}
                onFileSelect={handleFileSelect}
                onAddFileReference={handleAddFileReference}
                onAddFolderReference={handleAddFolderReference}
                onDeleteFile={handleDeleteFile}
                onDeleteFolder={handleDeleteFolder}
              />
            )}
          </ScrollArea>
        </>
      ) : (
        <FileViewer
          file={fileViewer.currentFile!}
          loading={fileViewer.loading}
          error={fileViewer.error}
          isEffectivelyPinned={isEffectivelyPinned}
          onBack={handleBackToTree}
          onAddFileReference={handleAddFileReference}
          onAddSnippetReference={handleAddSnippetReference}
        />
      )}
    </div>
  );

  // Fixed mode: aside panel
  if (isEffectivelyPinned) {
    return (
      <aside
        className="shrink-0 h-full bg-card border-l border-(--color-overlay-border) flex flex-col overflow-hidden relative"
        style={{
          width,
          transition: isTransitioning ? "width 300ms ease" : undefined,
        }}
        onTransitionEnd={() => setIsTransitioning(false)}
      >
        <div
          className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-20 hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={handleMouseDown}
        />
        {explorerContent}
      </aside>
    );
  }

  // Sheet mode
  return (
    <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
      <SheetContent side="right" className={cn(
        "p-0 bg-card border-l border-(--color-overlay-border)",
        view === "file" ? "w-[90vw] max-w-none" : "w-[320px]"
      )}>
        <SheetHeader className="sr-only">
          <SheetTitle>File Explorer</SheetTitle>
        </SheetHeader>
        {explorerContent}
      </SheetContent>
    </Sheet>
  );
}
