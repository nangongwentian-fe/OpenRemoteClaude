import { useState } from "react";
import {
  FileText,
  Pencil,
  FilePlus2,
  Terminal,
  FolderSearch,
  Search,
  Globe,
  Bot,
  ListChecks,
  Zap,
  Code,
  BookOpen,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Check,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileText,
  Edit: Pencil,
  Write: FilePlus2,
  Bash: Terminal,
  Glob: FolderSearch,
  Grep: Search,
  WebSearch: Globe,
  WebFetch: Globe,
  Agent: Bot,
  TodoWrite: ListChecks,
  Skill: Zap,
  LSP: Code,
  NotebookEdit: BookOpen,
};

interface Props {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "pending" | "allowed" | "denied";
  decisionReason?: string;
  description?: string;
  onRespond: (requestId: string, behavior: "allow" | "deny") => void;
}

export function PermissionCard({
  requestId,
  toolName,
  input,
  status,
  decisionReason,
  onRespond,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const ToolIcon = TOOL_ICONS[toolName] || Code;
  const summary = getSummary(toolName, input);

  const borderColor =
    status === "pending"
      ? "border-warning/60"
      : status === "allowed"
        ? "border-success/50"
        : "border-destructive/50";

  const StatusIcon =
    status === "pending"
      ? ShieldAlert
      : status === "allowed"
        ? ShieldCheck
        : ShieldX;

  const statusColor =
    status === "pending"
      ? "text-warning"
      : status === "allowed"
        ? "text-success"
        : "text-destructive";

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <div
        className={cn(
          "bg-(--color-overlay) border rounded-xl my-2 overflow-hidden transition-colors",
          borderColor
        )}
      >
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] cursor-pointer hover:bg-(--color-overlay) transition-colors">
            <div
              className={cn(
                "size-6 rounded-md flex items-center justify-center shrink-0",
                status === "pending"
                  ? "bg-warning/15"
                  : status === "allowed"
                    ? "bg-success/15"
                    : "bg-destructive/15"
              )}
            >
              <StatusIcon className={cn("size-3.5", statusColor)} />
            </div>
            <div className="size-6 rounded-md bg-(--color-overlay) flex items-center justify-center shrink-0">
              <ToolIcon className="size-3.5 text-muted-foreground" />
            </div>
            <span className="font-semibold shrink-0">{toolName}</span>
            <span className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
              {summary}
            </span>
            <div className="shrink-0">
              {collapsed ? (
                <ChevronRight className="size-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-(--color-overlay-border) px-3 py-2.5">
            {decisionReason && (
              <p className="text-xs text-muted-foreground mb-2">
                {decisionReason}
              </p>
            )}
            <pre className="font-mono text-xs text-muted-foreground overflow-x-auto max-h-50 overflow-y-auto whitespace-pre-wrap break-all">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>

        {status === "pending" && (
          <div className="border-t border-(--color-overlay-border) px-3 py-2 flex items-center justify-end gap-2">
            <button
              onClick={() => onRespond(requestId, "deny")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <X className="size-3" />
              Deny
            </button>
            <button
              onClick={() => onRespond(requestId, "allow")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-success text-white hover:bg-success/90 transition-colors cursor-pointer"
            >
              <Check className="size-3" />
              Allow
            </button>
          </div>
        )}

        {status !== "pending" && (
          <div className="border-t border-(--color-overlay-border) px-3 py-1.5 flex items-center justify-end">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                status === "allowed" ? "text-success" : "text-destructive"
              )}
            >
              {status === "allowed" ? (
                <>
                  <ShieldCheck className="size-3" />
                  Allowed
                </>
              ) : (
                <>
                  <ShieldX className="size-3" />
                  Denied
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </Collapsible>
  );
}

function getSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return (input.file_path as string) || "";
    case "Edit":
      return (input.file_path as string) || "";
    case "Write":
      return (input.file_path as string) || "";
    case "Bash":
      return truncate((input.command as string) || "", 60);
    case "Glob":
      return (input.pattern as string) || "";
    case "Grep":
      return (input.pattern as string) || "";
    case "WebSearch":
      return (input.query as string) || "";
    default:
      return "";
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}
