import { useState, useCallback, useEffect } from "react";
import type { Thread } from "../types/messages";

export function useThreads(token: string | null) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/threads?limit=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch {
      // 静默失败，不影响主流程
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadThreadMessages = useCallback(
    async (threadId: string) => {
      if (!token) return [];
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
      return [];
    },
    [token]
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      setActiveThreadId(threadId);
      const messages = await loadThreadMessages(threadId);
      return messages;
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
