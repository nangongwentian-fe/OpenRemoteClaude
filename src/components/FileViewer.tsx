import { useRef, useState } from "react";
import { ArrowLeft, AtSign, Loader2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { CodeSelectionPopover } from "./CodeSelectionPopover";
import { useHighlightedCode, tokenStyle } from "@/hooks/useHighlightedCode";
import { cn } from "@/lib/utils";
import type { FileContent } from "@/types/messages";

interface Props {
  file: FileContent;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onAddFileReference: (path: string, name: string) => void;
  onAddSnippetReference: (path: string, name: string, startLine: number, endLine: number, content: string) => void;
}

export function FileViewer({
  file,
  loading,
  error,
  onBack,
  onAddFileReference,
  onAddSnippetReference,
}: Props) {
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const [wrapLines, setWrapLines] = useState(true);
  const highlighted = useHighlightedCode(file?.content, file?.language);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">Loading file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground px-4">
        <AlertCircle className="size-5 text-destructive/60" />
        <span className="text-sm text-center">{error}</span>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-2">
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>
    );
  }

  if (!file) return null;

  const rawLines = file.content.split("\n");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-(--color-overlay-border) shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-lg hover:bg-(--color-overlay-hover)"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium truncate flex-1 min-w-0 text-foreground/90">
          {file.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-(--color-overlay-hover)",
            wrapLines && "text-primary"
          )}
          aria-pressed={wrapLines}
          aria-label={wrapLines ? "Disable line wrap" : "Enable line wrap"}
          title={wrapLines ? "Switch to horizontal scroll" : "Switch to line wrap"}
          onClick={() => setWrapLines((prev) => !prev)}
        >
          {wrapLines ? "Wrap" : "Scroll"}
        </Button>
        <button
          onClick={() => onAddFileReference(file.path, file.name)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-(--color-overlay-hover) transition-colors cursor-pointer"
          title="Reference entire file"
        >
          <AtSign className="size-3" />
          File
        </button>
      </div>

      {/* Code content */}
      <ScrollArea className="flex-1">
        <div
          ref={codeContainerRef}
          className={cn(
            "relative file-viewer-code",
            wrapLines ? "w-full" : "inline-block min-w-full"
          )}
        >
          <CodeSelectionPopover
            containerRef={codeContainerRef}
            filePath={file.path}
            fileName={file.name}
            onAddReference={(startLine, endLine, content) => {
              onAddSnippetReference(file.path, file.name, startLine, endLine, content);
            }}
          />
          <table
            className={cn(
              "text-[13px] leading-relaxed font-mono",
              wrapLines ? "w-full" : "w-max min-w-full"
            )}
          >
            <tbody>
              {(highlighted || rawLines).map((line, i) => (
                <tr key={i} data-line={i + 1} className="hover:bg-(--color-overlay)">
                  <td className="select-none text-right pr-3 pl-3 text-muted-foreground/40 w-[1%] whitespace-nowrap align-top">
                    {i + 1}
                  </td>
                  <td
                    className={cn(
                      "pr-4 text-foreground/85",
                      wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                    )}
                  >
                    {Array.isArray(line)
                      ? line.map((token, j) => (
                          <span key={j} style={tokenStyle(token)}>{token.content}</span>
                        ))
                      : (line || "\n")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  );
}
