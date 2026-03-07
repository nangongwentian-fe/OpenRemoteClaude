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
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
  collapsed: boolean;
}

export function ToolCallCard({ name, input, result, isError, collapsed: initialCollapsed }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const Icon = TOOL_ICONS[name] || ChevronRight;
  const summary = getSummary(name, input);

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <div className={cn(
        "bg-(--color-overlay) border rounded-xl my-2 overflow-hidden transition-colors",
        isError ? "border-destructive/50" : "border-(--color-overlay-border)"
      )}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] cursor-pointer hover:bg-(--color-overlay) transition-colors">
            <div className="size-6 rounded-md bg-(--color-overlay) flex items-center justify-center shrink-0">
              <Icon className="size-3.5 text-muted-foreground" />
            </div>
            <span className="font-semibold shrink-0">{name}</span>
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
            {input && (
              <pre className="font-mono text-xs text-muted-foreground overflow-x-auto max-h-50 overflow-y-auto whitespace-pre-wrap break-all">
                {formatInput(input)}
              </pre>
            )}
            {result && (
              <div className={`mt-2 pt-2 border-t border-(--color-overlay-border) ${isError ? "text-destructive" : ""}`}>
                <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-75 overflow-y-auto">
                  {truncate(result, 2000)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function getSummary(name: string, input: string): string {
  try {
    const parsed = JSON.parse(input);
    switch (name) {
      case "Read":
        return parsed.file_path || "";
      case "Edit":
        return parsed.file_path || "";
      case "Write":
        return parsed.file_path || "";
      case "Bash":
        return truncate(parsed.command || "", 50);
      case "Glob":
        return parsed.pattern || "";
      case "Grep":
        return parsed.pattern || "";
      case "WebSearch":
        return parsed.query || "";
      default:
        return "";
    }
  } catch {
    return truncate(input, 40);
  }
}

function formatInput(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}
