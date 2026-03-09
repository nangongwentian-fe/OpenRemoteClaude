import { useState, useCallback } from "react";
import type { FileContent } from "@/types/messages";

export function useFileViewer(token: string | null) {
  const [currentFile, setCurrentFile] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (path: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/file?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to read file");
        setCurrentFile(null);
        return;
      }
      setCurrentFile(data);
    } catch {
      setError("Network error");
      setCurrentFile(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const closeFile = useCallback(() => {
    setCurrentFile(null);
    setError(null);
  }, []);

  return { currentFile, loading, error, openFile, closeFile };
}
