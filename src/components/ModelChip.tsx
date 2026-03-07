import { Cpu, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import type { ModelInfo } from "@/types/messages";

// 从模型 ID 提取简称
function shortName(model: string, displayName?: string): string {
  if (displayName) {
    // "Claude Opus 4.6" → "Opus"
    const match = displayName.match(/\b(Opus|Sonnet|Haiku)\b/i);
    if (match) return match[1];
    return displayName.split(" ").pop() || displayName;
  }
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-").slice(0, 2).join("-");
}

interface Props {
  currentModel: string;
  models: ModelInfo[];
  onSelect: (model: string) => void;
  disabled?: boolean;
}

export function ModelChip({ currentModel, models, onSelect, disabled }: Props) {
  const current = models.find((m) => m.value === currentModel);
  const label = shortName(currentModel, current?.displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled || models.length === 0} asChild>
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) px-2 py-1 text-[11px] text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Cpu className="size-3" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {models.map((m) => (
          <DropdownMenuItem
            key={m.value}
            onClick={() => onSelect(m.value)}
          >
            <span className="flex-1">{m.displayName || m.value}</span>
            {m.value === currentModel && (
              <Check className="size-3 text-primary ml-2" />
            )}
          </DropdownMenuItem>
        ))}
        {models.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">Loading models...</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
