import { Slash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import type { SlashCommandInfo } from "@/types/messages";

interface Props {
  commands: SlashCommandInfo[];
  onSelect: (command: string) => void;
}

export function SlashCommandButton({ commands, onSelect }: Props) {
  if (commands.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center justify-center size-7 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer">
          <Slash className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] max-h-[240px] overflow-y-auto">
        {commands.map((cmd) => (
          <DropdownMenuItem
            key={cmd.name}
            onClick={() => onSelect(cmd.name)}
          >
            <span className="text-primary font-mono text-xs">/{cmd.name}</span>
            {cmd.description && (
              <span className="text-[10px] text-muted-foreground/60 ml-2 truncate">
                {cmd.description}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
