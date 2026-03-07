import { Plug2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import type { McpServerInfo } from "@/types/messages";

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-success",
  running: "bg-success",
  failed: "bg-destructive",
  error: "bg-destructive",
  pending: "bg-warning",
  disabled: "bg-muted-foreground/40",
};

interface Props {
  servers: McpServerInfo[];
}

export function McpStatusChip({ servers }: Props) {
  if (servers.length === 0) return null;

  const connectedCount = servers.filter(
    (s) => s.status === "connected" || s.status === "running"
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) px-2 py-1 text-[11px] text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer">
          <Plug2 className="size-3" />
          {connectedCount}/{servers.length}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {servers.map((s) => (
          <DropdownMenuItem key={s.name} disabled>
            <span className={`size-1.5 rounded-full shrink-0 ${STATUS_COLORS[s.status] || "bg-muted-foreground/40"}`} />
            <span className="flex-1 truncate ml-2">{s.name}</span>
            <span className="text-[10px] text-muted-foreground/60 ml-2">{s.status}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
