import { Plus, MessageSquare, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { cn } from "@/lib/utils";
import type { Thread } from "../types/messages";

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  loading: boolean;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  isPinned: boolean;
  isDesktop: boolean;
  isEffectivelyPinned: boolean;
  onTogglePin: () => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  loading,
  onSelectThread,
  onNewThread,
  isPinned,
  isDesktop,
  isEffectivelyPinned,
  onTogglePin,
  sheetOpen,
  onSheetOpenChange,
}: Props) {
  const handleSelectThread = (threadId: string) => {
    onSelectThread(threadId);
    if (!isEffectivelyPinned) {
      onSheetOpenChange(false);
    }
  };

  const handleNewThread = () => {
    onNewThread();
    if (!isEffectivelyPinned) {
      onSheetOpenChange(false);
    }
  };

  const sidebarContent = (
    <>
      <div className={cn(
        "px-4 pb-3",
        isEffectivelyPinned
          ? "pt-[calc(0.75rem+env(safe-area-inset-top,0px))]"
          : "pt-[calc(1rem+env(safe-area-inset-top,0px))]",
        !isEffectivelyPinned && "pr-10"
      )}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Threads</h2>
          {isDesktop && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg hover:bg-(--color-overlay-hover)"
              onClick={onTogglePin}
              aria-label={isPinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {isPinned ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeft className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 h-10 rounded-xl border-dashed border-(--color-overlay-border) bg-(--color-overlay) hover:bg-(--color-overlay-hover) hover:border-border transition-all"
          onClick={handleNewThread}
        >
          <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plus className="size-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium">New Thread</span>
        </Button>
      </div>

      <Separator className="bg-(--color-overlay-border)" />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 px-3 py-2">
          {loading && threads.length === 0 && (
            <div className="flex flex-col gap-2 px-2 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          )}
          {!loading && threads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <MessageSquare className="size-8 opacity-30" />
              <p className="text-sm">No threads yet</p>
            </div>
          )}
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all duration-150 cursor-pointer group overflow-hidden",
                thread.id === activeThreadId
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-(--color-overlay-hover) border border-transparent"
              )}
            >
              <div
                className={cn(
                  "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                  thread.id === activeThreadId
                    ? "bg-primary/20 text-primary"
                    : "bg-(--color-overlay) text-muted-foreground group-hover:bg-(--color-overlay-hover)"
                )}
              >
                <MessageSquare className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "truncate font-medium leading-tight",
                    thread.id === activeThreadId
                      ? "text-primary"
                      : "text-foreground"
                  )}
                >
                  {thread.title}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {timeAgo(thread.lastModified)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </>
  );

  // 固定模式：渲染为 aside 静态面板
  if (isEffectivelyPinned) {
    return (
      <aside className="w-[280px] shrink-0 h-full bg-card border-r border-(--color-overlay-border) flex flex-col overflow-hidden">
        {sidebarContent}
      </aside>
    );
  }

  // 抽屉模式：渲染为受控 Sheet
  return (
    <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 bg-card border-r border-(--color-overlay-border)">
        <SheetHeader className="sr-only">
          <SheetTitle>Threads</SheetTitle>
        </SheetHeader>
        {sidebarContent}
      </SheetContent>
    </Sheet>
  );
}
