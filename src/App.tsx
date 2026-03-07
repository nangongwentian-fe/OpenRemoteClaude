import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { useMessages } from "./hooks/useMessages";
import { useThreads } from "./hooks/useThreads";
import { useTheme } from "./hooks/useTheme";
import { Login } from "./pages/Login";
import { Chat } from "./pages/Chat";
import type { ServerMessage } from "./types/messages";

export default function App() {
  const { theme, resolved, setTheme } = useTheme();
  const auth = useAuth();
  const {
    messages,
    isProcessing,
    currentSessionId,
    addUserMessage,
    handleServerMessage,
    clearMessages,
    loadHistoryMessages,
  } = useMessages();
  const {
    threads,
    activeThreadId,
    setActiveThreadId,
    loading: threadsLoading,
    fetchThreads,
    switchThread,
    startNewThread,
  } = useThreads(auth.token);

  // 当收到 chat_complete 时刷新 thread 列表
  const fetchThreadsRef = useRef(fetchThreads);
  fetchThreadsRef.current = fetchThreads;

  const wrappedHandler = useCallback(
    (msg: ServerMessage) => {
      handleServerMessage(msg);
      if (msg.type === "chat_complete" || msg.type === "result") {
        fetchThreadsRef.current();
      }
    },
    [handleServerMessage]
  );

  const ws = useWebSocket(auth.token, wrappedHandler);

  // 当 SDK 返回 sessionId 且当前没有 activeThreadId 时，更新 activeThreadId
  useEffect(() => {
    if (currentSessionId && !activeThreadId) {
      setActiveThreadId(currentSessionId);
    }
  }, [currentSessionId, activeThreadId, setActiveThreadId]);

  if (!auth.token) {
    return (
      <Login
        initialized={auth.initialized}
        onSetup={auth.setup}
        onLogin={auth.login}
        error={auth.error}
        loading={auth.loading}
        theme={theme}
        resolved={resolved}
        onSetTheme={setTheme}
      />
    );
  }

  const handleSend = (prompt: string) => {
    addUserMessage(prompt);
    ws.sendChat(prompt, undefined, activeThreadId || undefined);
  };

  const handleSwitchThread = async (threadId: string) => {
    const rawMessages = await switchThread(threadId);
    loadHistoryMessages(rawMessages);
  };

  const handleNewThread = () => {
    startNewThread();
    clearMessages();
  };

  return (
    <Chat
      messages={messages}
      isProcessing={isProcessing}
      status={ws.status}
      threads={threads}
      activeThreadId={activeThreadId}
      threadsLoading={threadsLoading}
      theme={theme}
      onSetTheme={setTheme}
      onSend={handleSend}
      onInterrupt={ws.interrupt}
      onClear={handleNewThread}
      onSwitchThread={handleSwitchThread}
      onNewThread={handleNewThread}
      onLogout={() => {
        ws.disconnect();
        auth.logout();
      }}
    />
  );
}
