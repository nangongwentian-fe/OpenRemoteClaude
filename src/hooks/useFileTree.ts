import { useState, useCallback, useRef } from "react";
import type { FileTreeEntry } from "@/types/messages";

export function useFileTree(token: string | null) {
  const [tree, setTree] = useState<Map<string, FileTreeEntry[]>>(new Map());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const loadDirectory = useCallback(async (path: string) => {
    if (!token) return;

    // Abort any existing request for this path
    abortControllers.current.get(path)?.abort();
    const controller = new AbortController();
    abortControllers.current.set(path, controller);

    setLoadingPaths((prev) => new Set(prev).add(path));
    try {
      const res = await fetch(`/api/projects/tree?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setTree((prev) => {
        const next = new Map(prev);
        next.set(path, data.entries);
        return next;
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      abortControllers.current.delete(path);
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [token]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const refresh = useCallback((path?: string) => {
    if (path) {
      loadDirectory(path);
    } else {
      // Refresh all loaded directories
      for (const dirPath of tree.keys()) {
        loadDirectory(dirPath);
      }
    }
  }, [tree, loadDirectory]);

  const createFile = useCallback(async (parentPath: string, name: string) => {
    if (!token) return false;
    const res = await fetch("/api/projects/file", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: parentPath, name }),
    });
    if (res.ok) {
      await loadDirectory(parentPath);
      return true;
    }
    return false;
  }, [token, loadDirectory]);

  const deleteFile = useCallback(async (filePath: string, parentPath: string) => {
    if (!token) return false;
    const res = await fetch("/api/projects/file", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: filePath }),
    });
    if (res.ok) {
      await loadDirectory(parentPath);
      return true;
    }
    return false;
  }, [token, loadDirectory]);

  const createFolder = useCallback(async (parentPath: string, name: string) => {
    if (!token) return false;
    const res = await fetch("/api/projects/mkdir", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: parentPath, name }),
    });
    if (res.ok) {
      await loadDirectory(parentPath);
      return true;
    }
    return false;
  }, [token, loadDirectory]);

  const deleteFolder = useCallback(async (folderPath: string, parentPath: string, force?: boolean) => {
    if (!token) return false;
    const res = await fetch("/api/projects/rmdir", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: folderPath, force }),
    });
    if (res.ok) {
      // Remove from tree cache
      setTree((prev) => {
        const next = new Map(prev);
        next.delete(folderPath);
        return next;
      });
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
      await loadDirectory(parentPath);
      return true;
    }
    return false;
  }, [token, loadDirectory]);

  const reset = useCallback(() => {
    for (const c of abortControllers.current.values()) c.abort();
    abortControllers.current.clear();
    setTree(new Map());
    setExpandedPaths(new Set());
    setLoadingPaths(new Set());
  }, []);

  return {
    tree,
    expandedPaths,
    loadingPaths,
    loadDirectory,
    toggleExpand,
    refresh,
    createFile,
    deleteFile,
    createFolder,
    deleteFolder,
    reset,
  };
}
