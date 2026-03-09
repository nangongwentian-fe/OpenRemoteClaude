import { useState, useEffect } from "react";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

interface Props {
  thinking: string;
  collapsed: boolean;
}

export function ThinkingBlock({ thinking, collapsed: initialCollapsed }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    if (initialCollapsed) setCollapsed(true);
  }, [initialCollapsed]);

  if (!thinking) return null;

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <div className="my-2 rounded-xl bg-warning/5 border border-warning/10 overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-warning/80 cursor-pointer hover:bg-warning/5 transition-colors">
            <Brain className="size-3.5" />
            <span className="font-semibold">Thinking</span>
            {collapsed && (
              <span className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
                {thinking.slice(0, 60)}
                {thinking.length > 60 ? "..." : ""}
              </span>
            )}
            <div className="ml-auto shrink-0">
              {collapsed ? (
                <ChevronRight className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 text-[13px] text-muted-foreground/80 max-h-75 overflow-y-auto">
            <MarkdownRenderer text={thinking} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
