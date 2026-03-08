import { useState } from "react";
import { Zap, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import type { ThinkingMode } from "@/types/messages";

const THINKING_CONFIG: Record<ThinkingMode, { label: string }> = {
  adaptive: { label: "Adaptive" },
  enabled: { label: "Enabled" },
  disabled: { label: "Disabled" },
};

const ALL_MODES: ThinkingMode[] = ["adaptive", "enabled", "disabled"];

interface Props {
  thinking: ThinkingMode | undefined;
  onSelect: (mode: ThinkingMode) => void;
}

export function ThinkingChip({ thinking = "adaptive", onSelect }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isActive = thinking !== "disabled";

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <Tooltip open={dropdownOpen ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-(--color-overlay-border) bg-(--color-overlay) text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground"
              }`}
            >
              <Zap className="size-3" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Thinking</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[130px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {ALL_MODES.map((mode) => (
          <DropdownMenuItem key={mode} onClick={() => onSelect(mode)}>
            <span className="flex-1">{THINKING_CONFIG[mode].label}</span>
            {mode === thinking && <Check className="size-3 text-primary ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
