import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { useMessages } from "./hooks/useMessages";
import { useThreads } from "./hooks/useThreads";
import { useTheme } from "./hooks/useTheme";
import { usePreferences } from "./hooks/usePreferences";
import { useCapabilities } from "./hooks/useCapabilities";
import { useAttachments } from "./hooks/useAttachments";
import { useProjects } from "./hooks/useProjects";
import { Login } from "./pages/Login";
import { Chat } from "./pages/Chat";
import { ProjectManager } from "./components/ProjectManager";
import type { ServerMessage, Project, ModelInfo } from "./types/messages";

const MODEL_CHOSEN_KEY = "rcc_model_chosen";

export default function App() {
  const { theme, resolved, setTheme } = useTheme();
  const auth = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const capabilities = useCapabilities(preferences.model);
  const attachments = useAttachments();
  const projectsHook = useProjects(auth.token);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
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
  } = useThreads(auth.token, projectsHook.activeProject?.path);

  // 当收到 chat_complete 时刷新 thread 列表
  const fetchThreadsRef = useRef(fetchThreads);
  fetchThreadsRef.current = fetchThreads;
  const updatePreferenceRef = useRef(updatePreference);
  updatePreferenceRef.current = updatePreference;

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
        // 用户从未手动选过模型时，自动选择最新的 Sonnet 模型
        const userHasChosen = localStorage.getItem(MODEL_CHOSEN_KEY) === "true";
        if (!userHasChosen && msg.payload.models?.length > 0) {
          const latestSonnet = (msg.payload.models as ModelInfo[]).find((m) =>
            m.displayName?.toLowerCase().includes("sonnet")
          );
          const autoModel = latestSonnet || msg.payload.models[0];
          if (autoModel) {
            capabilities.setCurrentModel(autoModel.value);
            updatePreferenceRef.current("model", autoModel.value);
          }
        }
      }
      if (msg.type === "model_changed") {
        capabilities.setCurrentModel(msg.payload.model);
        updatePreferenceRef.current("model", msg.payload.model);
      }
      if (msg.type === "permission_mode_changed") {
        capabilities.setCurrentPermissionMode(msg.payload.mode);
      }
    },
    [handleServerMessage, capabilities]
  );

  const ws = useWebSocket(auth.token, wrappedHandler, auth.logout);

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

  const handleSetModel = useCallback(
    (model: string) => {
      capabilities.setCurrentModel(model);
      updatePreference("model", model);
      localStorage.setItem(MODEL_CHOSEN_KEY, "true");
      ws.setModel(model);
    },
    [capabilities, updatePreference, ws]
  );

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

    const cwd = projectsHook.activeProject?.path
      || threads.find((t) => t.id === activeThreadId)?.cwd
      || undefined;

    addUserMessage(prompt);
    ws.sendChat(finalPrompt, cwd, activeThreadId || undefined, preferences);
  };

  const handleSwitchThread = async (threadId: string) => {
    const rawMessages = await switchThread(threadId);
    loadHistoryMessages(rawMessages);
  };

  const handleNewThread = () => {
    startNewThread();
    clearMessages();
  };

  const handleSwitchProject = (project: Project | null) => {
    projectsHook.switchProject(project);
    startNewThread();
    clearMessages();
  };

  return (
    <>
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
      onSetModel={handleSetModel}
      attachments={attachments.attachments}
      onAddAttachments={attachments.addAttachments}
      onRemoveAttachment={attachments.removeAttachment}
      activeProject={projectsHook.activeProject}
      projects={projectsHook.projects}
      onSwitchProject={handleSwitchProject}
      onManageProjects={() => setProjectManagerOpen(true)}
      showProjectLabel={!projectsHook.activeProject}
    />
    <ProjectManager
      open={projectManagerOpen}
      onOpenChange={setProjectManagerOpen}
      projects={projectsHook.projects}
      token={auth.token!}
      onAddProject={projectsHook.addProject}
      onRemoveProject={projectsHook.removeProject}
    />
  </>
  );
}
