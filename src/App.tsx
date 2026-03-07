import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { useMessages } from "./hooks/useMessages";
import { useThreads } from "./hooks/useThreads";
import { useTheme } from "./hooks/useTheme";
import { usePreferences } from "./hooks/usePreferences";
import { useCapabilities } from "./hooks/useCapabilities";
import { useAttachments } from "./hooks/useAttachments";
import { Login } from "./pages/Login";
import { Chat } from "./pages/Chat";
import type { ServerMessage } from "./types/messages";

export default function App() {
  const { theme, resolved, setTheme } = useTheme();
  const auth = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const capabilities = useCapabilities();
  const attachments = useAttachments();
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
      if (msg.type === "system_init") {
        capabilities.handleSystemInit(msg.payload);
      }
      if (msg.type === "capabilities") {
        capabilities.handleCapabilities(msg.payload);
      }
      if (msg.type === "model_changed") {
        capabilities.setCurrentModel(msg.payload.model);
      }
      if (msg.type === "permission_mode_changed") {
        capabilities.setCurrentPermissionMode(msg.payload.mode);
      }
    },
    [handleServerMessage, capabilities]
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

  const handleSend = async (prompt: string) => {
    // 上传附件
    let finalPrompt = prompt;
    if (attachments.attachments.length > 0) {
      const filePaths = await attachments.uploadAll(auth.token!);
      if (filePaths.length > 0) {
        finalPrompt = `${prompt}\n\n[Attached files:\n${filePaths.map((p) => `- ${p}`).join("\n")}\n]`;
      }
      attachments.clear();
    }

    addUserMessage(prompt);
    ws.sendChat(finalPrompt, undefined, activeThreadId || undefined, preferences);
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
      preferences={preferences}
      onUpdatePreference={updatePreference}
      models={capabilities.models}
      commands={capabilities.commands}
      mcpServers={capabilities.mcpServers}
      currentModel={capabilities.currentModel}
      onSetModel={ws.setModel}
      attachments={attachments.attachments}
      onAddAttachments={attachments.addAttachments}
      onRemoveAttachment={attachments.removeAttachment}
    />
  );
}
