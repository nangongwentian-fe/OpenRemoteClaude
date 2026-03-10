import { useState, useCallback, useEffect, useRef } from "react";
import type { Thread } from "../types/messages";

export function useThreads(token: string | null, projectPath?: string) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const threadsAbortRef = useRef<AbortController | null>(null);
  const messagesAbortRef = useRef<AbortController | null>(null);
  const switchRequestIdRef = useRef(0);

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    threadsAbortRef.current?.abort();
    const controller = new AbortController();
    threadsAbortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (projectPath) params.set("dir", projectPath);
      const res = await fetch(`/api/threads?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      // 静默失败，不影响主流程
    } finally {
      if (threadsAbortRef.current === controller) {
        threadsAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [token, projectPath]);

  const loadThreadMessages = useCallback(
    async (threadId: string) => {
      if (!token) return [];
      messagesAbortRef.current?.abort();
      const controller = new AbortController();
      messagesAbortRef.current = controller;
      try {
        const res = await fetch(`/api/threads/${threadId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          return data.messages || [];
        }
        return [];
      } finally {
        if (messagesAbortRef.current === controller) {
          messagesAbortRef.current = null;
        }
      }
    },
    [token]
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      const requestId = ++switchRequestIdRef.current;
      setActiveThreadId(threadId);
      try {
        const messages = await loadThreadMessages(threadId);
        if (requestId !== switchRequestIdRef.current) {
          return null;
        }
        return messages;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return null;
        }
        throw err;
      }
    },
    [loadThreadMessages]
  );

  const startNewThread = useCallback(() => {
    setActiveThreadId(null);
  }, []);

  // 初始加载
  useEffect(() => {
    if (token) fetchThreads();
  }, [token, fetchThreads]);

  useEffect(() => {
    return () => {
      threadsAbortRef.current?.abort();
      messagesAbortRef.current?.abort();
    };
  }, []);

  return {
    threads,
    activeThreadId,
    setActiveThreadId,
    loading,
    fetchThreads,
    switchThread,
    startNewThread,
  };
}
