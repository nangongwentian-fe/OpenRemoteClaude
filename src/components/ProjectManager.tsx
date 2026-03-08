import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen,
  FolderGit2,
  FolderPlus,
  ChevronRight,
  Trash2,
  Plus,
  ArrowUp,
  Loader2,
  Check,
  X,
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
import { cn } from "@/lib/utils";
import type { Project } from "../types/messages";

interface BrowseEntry {
  name: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  token: string;
  onAddProject: (path: string, name?: string) => Promise<void>;
  onRemoveProject: (path: string) => Promise<void>;
}

export function ProjectManager({
  open,
  onOpenChange,
  projects,
  token,
  onAddProject,
  onRemoveProject,
}: Props) {
  const [browsePath, setBrowsePath] = useState("");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const browse = useCallback(
    async (path?: string) => {
      setBrowseLoading(true);
      setError("");
      try {
        const params = path ? `?path=${encodeURIComponent(path)}` : "";
        const res = await fetch(`/api/projects/browse${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBrowsePath(data.current);
          setParentPath(data.parent);
          setEntries(data.entries || []);
        } else {
          const data = await res.json();
          setError(data.error || "Failed to browse");
        }
      } catch {
        setError("Failed to connect");
      } finally {
        setBrowseLoading(false);
      }
    },
    [token]
  );

  // 打开时自动加载 HOME 目录
  useEffect(() => {
    if (open && !browsePath) browse();
  }, [open, browsePath, browse]);

  const handleAddCurrent = async () => {
    if (!browsePath) return;
    setAdding(true);
    setError("");
    try {
      await onAddProject(browsePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const isAlreadyAdded = projects.some((p) => p.path === browsePath);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !browsePath) return;
    setFolderCreating(true);
    setError("");
    try {
      const res = await fetch("/api/projects/mkdir", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parent: browsePath, name: newFolderName.trim() }),
      });
      if (res.ok) {
        setCreatingFolder(false);
        setNewFolderName("");
        await browse(browsePath);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create folder");
      }
    } catch {
      setError("Failed to connect");
    } finally {
      setFolderCreating(false);
    }
  };

  const handleDeleteFolder = async (name: string, force = false) => {
    const fullPath = `${browsePath === "/" ? "" : browsePath}/${name}`;
    if (!force && !window.confirm(`Delete folder "${name}"?`)) return;
    setDeleting(name);
    setError("");
    try {
      const res = await fetch("/api/projects/rmdir", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: fullPath, force }),
      });
      if (res.ok) {
        await browse(browsePath);
      } else {
        const data = await res.json();
        if (data.error?.includes("not empty") && !force) {
          if (window.confirm(`Folder "${name}" is not empty (${data.count} items). Delete anyway?`)) {
            await handleDeleteFolder(name, true);
            return;
          }
        } else {
          setError(data.error || "Failed to delete");
        }
      }
    } catch {
      setError("Failed to connect");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (creatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [creatingFolder]);

  // 面包屑路径段
  const pathSegments = browsePath
    .split("/")
    .filter(Boolean)
    .map((seg, i, arr) => ({
      name: seg,
      path: "/" + arr.slice(0, i + 1).join("/"),
    }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[340px] sm:w-[400px] p-0 bg-card border-l border-(--color-overlay-border) flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3">
          <SheetTitle className="text-lg font-semibold tracking-tight">
            Manage Projects
          </SheetTitle>
        </SheetHeader>

        {/* 已添加的项目列表 */}
        {projects.length > 0 && (
          <>
            <div className="px-4 pb-2">
              <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                Added Projects
              </p>
            </div>
            <ScrollArea className="max-h-60">
              <div className="px-3 pb-3 flex flex-col gap-1">
                {projects.map((project) => (
                  <div
                    key={project.path}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-(--color-overlay) border border-(--color-overlay-border) group"
                  >
                    <FolderGit2 className="size-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {project.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 truncate">
                        {project.path}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg opacity-40 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                      onClick={() => onRemoveProject(project.path)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Separator className="bg-(--color-overlay-border)" />
          </>
        )}

        {/* 目录浏览器 */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
            Browse Directories
          </p>
        </div>

        {/* 面包屑导航 */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-0.5 text-xs overflow-x-auto [-webkit-overflow-scrolling:touch] pb-1.5 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
            <button
              onClick={() => browse("/")}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
            >
              /
            </button>
            {pathSegments.map((seg, i) => (
              <span key={seg.path} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && (
                  <ChevronRight className="size-3 text-muted-foreground/40" />
                )}
                <button
                  onClick={() => browse(seg.path)}
                  className={cn(
                    "transition-colors cursor-pointer px-1 py-0.5 rounded",
                    i === pathSegments.length - 1
                      ? "text-foreground font-medium bg-(--color-overlay)"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {seg.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* 目录列表 */}
        <ScrollArea className="flex-1 px-3">
          {browseLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground/50" />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 pb-2">
              {parentPath !== null && (
                <button
                  onClick={() => browse(parentPath)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-(--color-overlay-hover) transition-colors text-left cursor-pointer"
                >
                  <ArrowUp className="size-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">..</span>
                </button>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center rounded-xl hover:bg-(--color-overlay-hover) transition-colors group"
                >
                  <button
                    onClick={() => browse(`${browsePath === "/" ? "" : browsePath}/${entry.name}`)}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer min-w-0"
                  >
                    {entry.isGitRepo ? (
                      <FolderGit2 className="size-4 text-primary shrink-0" />
                    ) : (
                      <FolderOpen className="size-4 text-muted-foreground shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm truncate",
                        entry.isGitRepo
                          ? "font-medium text-foreground"
                          : "text-foreground/80"
                      )}
                    >
                      {entry.name}
                    </span>
                    {entry.isGitRepo && (
                      <span className="text-[10px] text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-full ml-auto shrink-0">
                        git
                      </span>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg opacity-40 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0 mr-2"
                    onClick={() => handleDeleteFolder(entry.name)}
                    disabled={deleting === entry.name}
                  >
                    {deleting === entry.name ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              ))}
              {entries.length === 0 && !browseLoading && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                  <FolderOpen className="size-8 mb-2 opacity-30" />
                  <p className="text-sm">Empty directory</p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* 底部操作栏 */}
        <div className="p-4 border-t border-(--color-overlay-border) pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {error && (
            <p className="text-xs text-destructive mb-2">{error}</p>
          )}
          {creatingFolder ? (
            <div className="flex items-center gap-2">
              <Input
                ref={newFolderInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="Folder name"
                className="flex-1 h-9 text-sm"
                disabled={folderCreating}
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || folderCreating}
              >
                {folderCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                onClick={() => {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }}
                disabled={folderCreating}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setCreatingFolder(true)}
                disabled={!browsePath}
              >
                <FolderPlus className="size-4" />
                New Folder
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleAddCurrent}
                disabled={!browsePath || isAlreadyAdded || adding}
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {isAlreadyAdded ? "Already Added" : "Add This Directory"}
              </Button>
            </div>
          )}
          {browsePath && (
            <p className="text-[11px] text-muted-foreground/60 text-center mt-2 truncate">
              {browsePath}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
