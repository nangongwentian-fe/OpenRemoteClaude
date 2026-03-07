import { Plus, MessageSquare } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { cn } from "@/lib/utils";
import type { Thread } from "../types/messages";

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  loading: boolean;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  children: React.ReactNode; // trigger button
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
  children,
}: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 bg-card border-r border-(--color-overlay-border)">
        <SheetHeader className="px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold tracking-tight">
              Threads
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="px-4 pb-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2.5 h-10 rounded-xl border-dashed border-(--color-overlay-border) bg-(--color-overlay) hover:bg-(--color-overlay-hover) hover:border-border transition-all"
            onClick={onNewThread}
          >
            <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plus className="size-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium">New Thread</span>
          </Button>
        </div>

        <Separator className="bg-(--color-overlay-border)" />

        <ScrollArea className="flex-1 h-[calc(100vh-160px)]">
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
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all duration-150 cursor-pointer group",
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
      </SheetContent>
    </Sheet>
  );
}
