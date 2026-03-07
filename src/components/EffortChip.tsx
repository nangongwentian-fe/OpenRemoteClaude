import { Gauge, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import type { EffortLevel } from "@/types/messages";

const EFFORT_CONFIG: Record<EffortLevel, { label: string; bars: number }> = {
  low: { label: "Low", bars: 1 },
  medium: { label: "Medium", bars: 2 },
  high: { label: "High", bars: 3 },
  max: { label: "Max", bars: 4 },
};

const ALL_LEVELS: EffortLevel[] = ["low", "medium", "high", "max"];

function EffortBars({ level, active }: { level: number; active?: boolean }) {
  return (
    <span className="inline-flex items-end gap-px">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm transition-colors ${
            i <= level
              ? active
                ? "bg-primary"
                : "bg-foreground/60"
              : "bg-foreground/15"
          }`}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </span>
  );
}

interface Props {
  effort: EffortLevel | undefined;
  supportedLevels?: EffortLevel[];
  onSelect: (effort: EffortLevel) => void;
}

export function EffortChip({ effort = "high", supportedLevels, onSelect }: Props) {
  const levels = supportedLevels && supportedLevels.length > 0 ? supportedLevels : ALL_LEVELS;
  const config = EFFORT_CONFIG[effort];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-overlay-border) bg-(--color-overlay) px-2 py-1 text-[11px] text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer">
          <EffortBars level={config.bars} active />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[130px]">
        {levels.map((level) => (
          <DropdownMenuItem key={level} onClick={() => onSelect(level)}>
            <EffortBars level={EFFORT_CONFIG[level].bars} />
            <span className="ml-2 flex-1">{EFFORT_CONFIG[level].label}</span>
            {level === effort && <Check className="size-3 text-primary ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
