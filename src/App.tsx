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
import { useFileReferences } from "./hooks/useFileReferences";
import { useTerminal } from "./hooks/useTerminal";
import { usePreviewPorts } from "./hooks/usePreviewPorts";
import { Login } from "./pages/Login";
import { Chat } from "./pages/Chat";
import { ProjectManager } from "./components/ProjectManager";
import type { ServerMessage, Project, ModelInfo, PermissionMode } from "./types/messages";

const MODEL_CHOSEN_KEY = "rcc_model_chosen";

export default function App() {
  const { theme, resolved, setTheme } = useTheme();
  const auth = useAuth();
  const { preferences, updatePreference } = usePreferences();
  const capabilities = useCapabilities(preferences.model, preferences.permissionMode);
  const attachments = useAttachments();
  const projectsHook = useProjects(auth.token);
  const fileReferences = useFileReferences();
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const {
    messages,
    isProcessing,
    currentSessionId,
    addUserMessage,
    handleServerMessage,
    clearMessages,
    loadHistoryMessages,
    updatePermissionStatus,
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
      // Terminal 消息转发
      if (msg.type === "terminal_created" || msg.type === "terminal_output" || msg.type === "terminal_exited" || msg.type === "terminal_list") {
        terminalRef.current.handleServerMessage(msg as { type: string; payload?: Record<string, unknown> });
      }
      if (msg.type === "terminal_exited") {
        const terminalId = (msg.payload as { id: string }).id;
        previewPortsRef.current.removePortsForTerminal(terminalId);
      }
      if (msg.type === "terminal_list") {
        const terminals = (msg.payload as { terminals?: Array<{ id: string }> }).terminals ?? [];
        const activeIds = new Set(terminals.map((t) => t.id));
        const staleTerminalIds = new Set(
          previewPortsRef.current.detectedPorts
            .map((p) => p.terminalId)
            .filter((id) => !activeIds.has(id))
        );
        for (const terminalId of staleTerminalIds) {
          previewPortsRef.current.removePortsForTerminal(terminalId);
        }
      }
      if (msg.type === "port_detected") {
        previewPortsRef.current.handlePortDetected(msg as { payload: { terminalId: string; port: number; url: string } });
      }
      if (msg.type === "chat_complete" || msg.type === "result") {
        fetchThreadsRef.current();
      }
      if (msg.type === "system_init") {
        capabilities.handleSystemInit(msg.payload);
        if (msg.payload.permissionMode) {
          updatePreferenceRef.current("permissionMode", msg.payload.permissionMode);
        }
      }
      if (msg.type === "capabilities") {
        capabilities.handleCapabilities(msg.payload);
        const models = (msg.payload.models as ModelInfo[]) || [];
        if (models.length > 0) {
          const userHasChosen = localStorage.getItem(MODEL_CHOSEN_KEY) === "true";
          const available = new Set(models.map((m) => m.value));
          const preferredModel = preferences.model;
          const preferredIsValid = preferredModel ? available.has(preferredModel) : false;
          const shouldAutoSelect = !preferredIsValid || (!userHasChosen && !preferredModel);

          if (shouldAutoSelect) {
            const latestSonnet = models.find((m) =>
              m.displayName?.toLowerCase().includes("sonnet")
            );
            const autoModel = latestSonnet || models[0];
            if (autoModel) {
              capabilities.setCurrentModel(autoModel.value);
              updatePreferenceRef.current("model", autoModel.value);
            }
          }
        }
      }
      if (msg.type === "model_changed") {
        capabilities.setCurrentModel(msg.payload.model);
        updatePreferenceRef.current("model", msg.payload.model);
      }
      if (msg.type === "permission_mode_changed") {
        capabilities.setCurrentPermissionMode(msg.payload.mode);
        updatePreferenceRef.current("permissionMode", msg.payload.mode);
      }
    },
    [handleServerMessage, capabilities, preferences.model]
  );

  const ws = useWebSocket(auth.token, wrappedHandler, auth.logout);
  const terminal = useTerminal(ws.sendRaw);
  const previewPorts = usePreviewPorts();

  // Refs for terminal/preview to avoid stale closures in wrappedHandler
  const terminalRef = useRef(terminal);
  terminalRef.current = terminal;
  const previewPortsRef = useRef(previewPorts);
  previewPortsRef.current = previewPorts;

  const capabilitiesCwd = projectsHook.activeProject?.path
    || threads.find((t) => t.id === activeThreadId)?.cwd
    || undefined;

  // 当 SDK 返回 sessionId 且当前没有 activeThreadId 时，更新 activeThreadId
  useEffect(() => {
    if (currentSessionId && !activeThreadId) {
      setActiveThreadId(currentSessionId);
    }
  }, [currentSessionId, activeThreadId, setActiveThreadId]);

  useEffect(() => {
    if (ws.status === "authenticated") {
      ws.requestCapabilities(capabilitiesCwd);
      terminal.requestTerminalList();
    }
  }, [ws.status, ws.requestCapabilities, capabilitiesCwd, terminal.requestTerminalList]);

  useEffect(() => {
    if (ws.status === "authenticated" && isProcessing && currentSessionId) {
      ws.reattachSession(currentSessionId);
    }
  }, [ws.status, ws.reattachSession, isProcessing, currentSessionId]);

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

  const handleSetPermissionMode = useCallback(
    (mode: PermissionMode) => {
      capabilities.setCurrentPermissionMode(mode);
      updatePreference("permissionMode", mode);
      if (isProcessing) {
        ws.setPermissionMode(mode);
      }
    },
    [capabilities, isProcessing, updatePreference, ws]
  );

  const handlePermissionRespond = useCallback(
    (requestId: string, behavior: "allow" | "deny", sessionId: string) => {
      ws.sendPermissionResponse(requestId, behavior, sessionId);
      updatePermissionStatus(requestId, behavior === "allow" ? "allowed" : "denied");
    },
    [ws, updatePermissionStatus]
  );

  const handleSend = async (prompt: string) => {
    // 上传附件
    let finalPrompt = prompt;
    let attachmentInfos: import("./types/messages").AttachmentInfo[] | undefined;
    if (attachments.attachments.length > 0) {
      const infos = await attachments.uploadAll(auth.token!);
      if (infos.length > 0) {
        attachmentInfos = infos;
        finalPrompt = `${prompt}\n\n[Attached files:\n${infos.map((i) => `- ${i.serverPath}`).join("\n")}\n]`;
      }
      attachments.clear();
    }

    // 序列化文件引用
    if (fileReferences.references.length > 0) {
      const refText = fileReferences.serialize();
      if (refText) {
        finalPrompt = `${finalPrompt}\n\n${refText}`;
      }
      fileReferences.clear();
    }

    const cwd = capabilitiesCwd;
    const availableModels = new Set(capabilities.models.map((m) => m.value));
    const sanitizedPreferences =
      preferences.model && availableModels.has(preferences.model)
        ? preferences
        : { ...preferences, model: undefined };

    addUserMessage(prompt, attachmentInfos);
    ws.sendChat(finalPrompt, cwd, activeThreadId || undefined, sanitizedPreferences);
  };

  const handleSwitchThread = async (threadId: string) => {
    const rawMessages = await switchThread(threadId);
    if (rawMessages !== null) {
      loadHistoryMessages(rawMessages);
    }
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
      currentPermissionMode={capabilities.currentPermissionMode}
      onSetPermissionMode={handleSetPermissionMode}
      onPermissionRespond={handlePermissionRespond}
      attachments={attachments.attachments}
      onAddAttachments={attachments.addAttachments}
      onRemoveAttachment={attachments.removeAttachment}
      activeProject={projectsHook.activeProject}
      projects={projectsHook.projects}
      onSwitchProject={handleSwitchProject}
      onManageProjects={() => setProjectManagerOpen(true)}
      showProjectLabel={!projectsHook.activeProject}
      token={auth.token!}
      references={fileReferences.references}
      onAddReference={fileReferences.addReference}
      onRemoveReference={fileReferences.removeReference}
      // Terminal
      terminal={terminal}
      // Preview
      previewPorts={previewPorts}
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
