import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SlashCommandInfo } from "@/types/messages";

interface Props {
  commands: SlashCommandInfo[];
  selectedIndex: number;
  onSelect: (command: SlashCommandInfo) => void;
}

export const SlashCommandPanel = memo(function SlashCommandPanel({
  commands,
  selectedIndex,
  onSelect,
}: Props) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div
        className={cn(
          "border border-(--color-overlay-border) rounded-xl",
          "bg-popover/95 backdrop-blur-xl shadow-xl",
          "overflow-hidden"
        )}
      >
        <div className="overflow-y-auto max-h-[280px] overscroll-contain">
          <div className="p-1">
            {commands.map((cmd, i) => (
              <div
                key={cmd.name}
                ref={(el) => {
                  if (el) itemRefs.current.set(i, el);
                  else itemRefs.current.delete(i);
                }}
                className={cn(
                  "flex flex-col gap-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  i === selectedIndex
                    ? "bg-(--color-overlay-hover)"
                    : "hover:bg-(--color-overlay)"
                )}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelect(cmd);
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-primary font-mono text-sm font-medium">
                    /{cmd.name}
                  </span>
                  {cmd.argumentHint && (
                    <span className="text-muted-foreground/40 font-mono text-xs">
                      {cmd.argumentHint}
                    </span>
                  )}
                </div>
                {cmd.description && (
                  <span className="text-muted-foreground/60 text-xs leading-snug line-clamp-1">
                    {cmd.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
