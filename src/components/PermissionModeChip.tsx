import { useState } from "react";
import { ShieldQuestion, ShieldCheck, FileSearch, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import type { PermissionMode } from "@/types/messages";

const MODE_CONFIG: Record<
  Exclude<PermissionMode, "dontAsk">,
  { label: string; description: string; Icon: LucideIcon }
> = {
  default: {
    label: "Ask",
    description: "Ask before edits",
    Icon: ShieldQuestion,
  },
  acceptEdits: {
    label: "Auto-edit",
    description: "Edit automatically",
    Icon: ShieldCheck,
  },
  plan: {
    label: "Plan",
    description: "Plan mode",
    Icon: FileSearch,
  },
};

const MODES: Exclude<PermissionMode, "dontAsk">[] = [
  "default",
  "acceptEdits",
  "plan",
];

interface Props {
  mode: PermissionMode;
  onSelect: (mode: PermissionMode) => void;
  disabled?: boolean;
}

export function PermissionModeChip({ mode, onSelect, disabled }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const config = MODE_CONFIG[mode as Exclude<PermissionMode, "dontAsk">] || MODE_CONFIG.acceptEdits;
  const { Icon } = config;

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <Tooltip open={dropdownOpen ? false : undefined}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) px-2 py-1 text-[11px] text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Icon className="size-3.5" />
              <span>{config.label}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Permission Mode</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="min-w-[170px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {MODES.map((m) => {
          const { label, description, Icon: ModeIcon } = MODE_CONFIG[m];
          return (
            <DropdownMenuItem key={m} onClick={() => onSelect(m)}>
              <ModeIcon className="size-4" />
              <div className="flex-1 min-w-0">
                <span>{label}</span>
                <span className="text-muted-foreground text-[10px] ml-1.5">
                  {description}
                </span>
              </div>
              {m === mode && (
                <Check className="size-3 text-primary ml-2 shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
