import { useState, useCallback } from "react";
import type { FileReference, NewFileReference } from "@/types/messages";

let refCounter = 0;

export function useFileReferences() {
  const [references, setReferences] = useState<FileReference[]>([]);

  const addReference = useCallback((ref: NewFileReference) => {
    const id = `ref_${++refCounter}_${Date.now()}`;
    setReferences((prev) => {
      // Deduplicate: skip if same type+path+lines already exists
      const exists = prev.some((r) => {
        if (r.type !== ref.type || r.path !== ref.path) return false;
        if (r.type === "code_snippet" && ref.type === "code_snippet") {
          return r.startLine === ref.startLine && r.endLine === ref.endLine;
        }
        return true;
      });
      if (exists) return prev;
      return [...prev, { ...ref, id } as FileReference];
    });
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clear = useCallback(() => {
    setReferences([]);
  }, []);

  const serialize = useCallback((): string => {
    if (references.length === 0) return "";

    const parts: string[] = ["[Referenced context:"];
    for (const ref of references) {
      if (ref.type === "file") {
        parts.push(`- ${ref.path} (file)`);
      } else if (ref.type === "folder") {
        parts.push(`- ${ref.path}/ (folder)`);
      } else if (ref.type === "code_snippet") {
        parts.push(`- ${ref.path}:${ref.startLine}-${ref.endLine}`);
        parts.push("```");
        parts.push(ref.content);
        parts.push("```");
      }
    }
    parts.push("]");
    return parts.join("\n");
  }, [references]);

  return { references, addReference, removeReference, clear, serialize };
}
