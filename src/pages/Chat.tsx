import { useRef, useEffect, useState } from "react";
import { Menu, MoreVertical, Plus, LogOut, Sparkles, Sun, Moon, Monitor, Check, FolderOpen, ChevronDown, Layers, FolderTree, TerminalSquare, MessageSquare, Globe } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { MessageList } from "../components/MessageList";
import { InputBar } from "../components/InputBar";
import { ThreadSidebar } from "../components/ThreadSidebar";
import { FileExplorer } from "../components/FileExplorer";
import { TerminalPanel } from "../components/TerminalPanel";
import { WebPreview } from "../components/WebPreview";
import { useSidebarPin } from "../hooks/useSidebarPin";
import { useFileExplorerPin } from "../hooks/useFileExplorerPin";
import { useResizableHeight } from "../hooks/useResizableHeight";
import type { ConnectionStatus, ChatMessage, Thread, ModelInfo, McpServerInfo, SlashCommandInfo, SessionPreferences, PermissionMode, Attachment, Project, FileReference, NewFileReference } from "../types/messages";
import type { Theme } from "../hooks/useTheme";
import type { useTerminal } from "../hooks/useTerminal";
import type { usePreviewPorts } from "../hooks/usePreviewPorts";

type ActiveView = "chat" | "preview";
type MobileTab = "chat" | "terminal" | "preview";

interface Props {
  messages: ChatMessage[];
  isProcessing: boolean;
  status: ConnectionStatus;
  threads: Thread[];
  activeThreadId: string | null;
  threadsLoading: boolean;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onSend: (prompt: string) => void;
  onInterrupt: () => void;
  onClear: () => void;
  onSwitchThread: (threadId: string) => void;
  onNewThread: () => void;
  onLogout: () => void;
  preferences: SessionPreferences;
  onUpdatePreference: <K extends keyof SessionPreferences>(key: K, value: SessionPreferences[K]) => void;
  models: ModelInfo[];
  commands: SlashCommandInfo[];
  mcpServers: McpServerInfo[];
  currentModel: string;
  onSetModel: (model: string) => void;
  currentPermissionMode: PermissionMode;
  onSetPermissionMode: (mode: PermissionMode) => void;
  onPermissionRespond: (requestId: string, behavior: "allow" | "deny", sessionId: string) => void;
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  activeProject: Project | null;
  projects: Project[];
  onSwitchProject: (project: Project | null) => void;
  onManageProjects: () => void;
  showProjectLabel: boolean;
  token: string;
  references: FileReference[];
  onAddReference: (ref: NewFileReference) => void;
  onRemoveReference: (id: string) => void;
  // Terminal
  terminal: ReturnType<typeof useTerminal>;
  // Preview
  previewPorts: ReturnType<typeof usePreviewPorts>;
}

export function Chat({
  messages,
  isProcessing,
  status,
  threads,
  activeThreadId,
  threadsLoading,
  theme,
  onSetTheme,
  onSend,
  onInterrupt,
  onClear,
  onSwitchThread,
  onNewThread,
  onLogout,
  preferences,
  onUpdatePreference,
  models,
  commands,
  mcpServers,
  currentModel,
  onSetModel,
  currentPermissionMode,
  onSetPermissionMode,
  onPermissionRespond,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  activeProject,
  projects,
  onSwitchProject,
  onManageProjects,
  showProjectLabel,
  token,
  references,
  onAddReference,
  onRemoveReference,
  terminal,
  previewPorts,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const { isPinned, isDesktop, isEffectivelyPinned, togglePin } = useSidebarPin();
  const explorerPin = useFileExplorerPin();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const { height: terminalHeight, handleMouseDown: handleTerminalResize } =
    useResizableHeight({
      storageKey: "rcc_terminal_height",
      defaultHeight: 250,
      minHeight: 120,
      maxHeight: 600,
    });

  // 检测用户是否在底部附近
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // 仅在接近底部时自动滚动
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (isNearBottomRef.current && container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const statusColor =
    status === "authenticated"
      ? "bg-success"
      : status === "connected" || status === "connecting"
        ? "bg-warning"
        : "bg-destructive";

  const statusText =
    status === "authenticated"
      ? "Connected"
      : status === "connecting"
        ? "Connecting..."
        : status === "connected"
          ? "Authenticating..."
          : "Disconnected";

  // 移动端检测
  const isMobile = !isDesktop;
  const isTerminalActive = isMobile ? mobileTab === "terminal" : terminal.terminalPanelVisible;

  const handleToggleTerminal = () => {
    if (isMobile) {
      setMobileTab(mobileTab === "terminal" ? "chat" : "terminal");
    } else {
      if (!terminal.terminalPanelVisible) {
        terminal.openTerminalPanel(activeProject?.path);
      } else {
        terminal.closeTerminalPanel();
      }
    }
  };

  // 移动端切换 terminal tab：仅隐藏/显示，不销毁终端实例
  useEffect(() => {
    if (!isMobile) return;
    if (mobileTab === "terminal") {
      terminal.openTerminalPanel(activeProject?.path);
    } else {
      terminal.closeTerminalPanel();
    }
  }, [mobileTab, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        loading={threadsLoading}
        onSelectThread={onSwitchThread}
        onNewThread={onNewThread}
        isPinned={isPinned}
        isDesktop={isDesktop}
        isEffectivelyPinned={isEffectivelyPinned}
        onTogglePin={togglePin}
        sheetOpen={sidebarOpen}
        onSheetOpenChange={setSidebarOpen}
        showProjectLabel={showProjectLabel}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] bg-card/80 backdrop-blur-md border-b border-(--color-overlay-border) min-h-[52px] relative z-10">
          <div className="flex min-w-0 items-center gap-2.5">
            {!isEffectivelyPinned && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-xl hover:bg-(--color-overlay-hover)"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="size-5" />
              </Button>
            )}
            <Badge
              variant="outline"
              className="max-w-full gap-1.5 py-0.5 px-2 text-[10px] sm:text-[11px] border-(--color-overlay-border) bg-(--color-overlay) font-normal"
            >
              <span className={`size-1.5 rounded-full ${statusColor}`} />
              <span className="truncate">{statusText}</span>
            </Badge>
          </div>

          <div className="min-w-0 px-1">
            {/* Desktop: View tabs + Project selector */}
            {!isMobile && (
              <div className="flex items-center justify-center gap-1">
                <div className="flex items-center gap-0.5 mr-2 bg-(--color-overlay) rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveView("chat")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                      activeView === "chat"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageSquare className="size-3" />
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveView("preview")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                      activeView === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Globe className="size-3" />
                    Preview
                  </button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-9 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-(--color-overlay-hover) cursor-pointer">
                      <FolderOpen className="size-3.5 text-primary shrink-0" />
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground/90 tracking-tight">
                        {activeProject?.name || "All Projects"}
                      </span>
                      <ChevronDown className="size-3 text-muted-foreground/60 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-56">
                    <DropdownMenuItem onClick={() => onSwitchProject(null)}>
                      <Layers className="size-4" />
                      All Projects
                      {!activeProject && <Check className="size-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                    {projects.length > 0 && <DropdownMenuSeparator />}
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.path}
                        onClick={() => onSwitchProject(project)}
                      >
                        <FolderOpen className="size-4" />
                        <div className="flex-1 min-w-0">
                          <span className="truncate">{project.name}</span>
                        </div>
                        {activeProject?.path === project.path && (
                          <Check className="size-3 ml-auto text-primary shrink-0" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onManageProjects}>
                      <Plus className="size-4" />
                      Manage Projects...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {/* Mobile: Project selector only */}
            {isMobile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="mx-auto flex h-9 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-(--color-overlay-hover) cursor-pointer">
                    <FolderOpen className="size-3.5 text-primary shrink-0" />
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground/90 tracking-tight">
                      {activeProject?.name || "All Projects"}
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground/60 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  <DropdownMenuItem onClick={() => onSwitchProject(null)}>
                    <Layers className="size-4" />
                    All Projects
                    {!activeProject && <Check className="size-3 ml-auto text-primary" />}
                  </DropdownMenuItem>
                  {projects.length > 0 && <DropdownMenuSeparator />}
                  {projects.map((project) => (
                    <DropdownMenuItem
                      key={project.path}
                      onClick={() => onSwitchProject(project)}
                    >
                      <FolderOpen className="size-4" />
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{project.name}</span>
                      </div>
                      {activeProject?.path === project.path && (
                        <Check className="size-3 ml-auto text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onManageProjects}>
                    <Plus className="size-4" />
                    Manage Projects...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center justify-self-end gap-1">
            {/* Terminal toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={`size-9 rounded-xl hover:bg-(--color-overlay-hover) ${isTerminalActive ? "text-primary" : ""}`}
              onClick={handleToggleTerminal}
              title="Terminal"
            >
              <TerminalSquare className="size-5" />
            </Button>
            {activeProject && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-xl hover:bg-(--color-overlay-hover)"
                onClick={() => {
                  if (explorerPin.isEffectivelyPinned) {
                    explorerPin.togglePin();
                  } else {
                    setExplorerOpen(true);
                  }
                }}
                title="File Explorer"
              >
                <FolderTree className="size-5" />
              </Button>
            )}
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-xl hover:bg-(--color-overlay-hover)">
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { onClear(); }}>
                <Plus className="size-4" />
                New Thread
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSetTheme("light")}>
                <Sun className="size-4" />
                Light
                {theme === "light" && <Check className="size-3 ml-auto text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetTheme("dark")}>
                <Moon className="size-4" />
                Dark
                {theme === "dark" && <Check className="size-3 ml-auto text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetTheme("system")}>
                <Monitor className="size-4" />
                System
                {theme === "system" && <Check className="size-3 ml-auto text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { onLogout(); }} className="text-destructive focus:text-destructive">
                <LogOut className="size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        {/* Desktop layout: content + terminal panel */}
        {!isMobile && (
          <>
            {/* Chat or Preview */}
            {activeView === "chat" ? (
              <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 [-webkit-overflow-scrolling:touch]">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <div className="relative mb-6">
                      <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                        <Sparkles className="size-8 text-primary/60" />
                      </div>
                      <div className="absolute inset-0 size-16 rounded-2xl bg-primary/5 blur-xl" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground/90 mb-2">
                      Ready to code
                    </h2>
                    <p className="text-sm text-muted-foreground/70 max-w-[240px] leading-relaxed">
                      Send a message to start a conversation with Claude Code
                    </p>
                    <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-[300px]">
                      {["Fix a bug", "Write a test", "Refactor code"].map((hint) => (
                        <button
                          key={hint}
                          onClick={() => onSend(hint)}
                          disabled={status !== "authenticated"}
                          className="px-3 py-1.5 rounded-full text-xs border border-(--color-overlay-border) text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <MessageList messages={messages} onPermissionRespond={onPermissionRespond} />
                <div ref={bottomRef} />
              </main>
            ) : (
              <div className="flex-1 min-h-0">
                <WebPreview
                  detectedPorts={previewPorts.detectedPorts}
                  activePort={previewPorts.activePreviewPort}
                  onSelectPort={previewPorts.setActivePreviewPort}
                  customUrl={previewPorts.customPreviewUrl}
                  onSetCustomUrl={previewPorts.setCustomPreviewUrl}
                />
              </div>
            )}

            {/* Terminal Panel (desktop) */}
            <TerminalPanel
              visible={terminal.terminalPanelVisible}
              terminals={terminal.terminals}
              activeTerminalId={terminal.activeTerminalId}
              onSetActive={terminal.setActiveTerminalId}
              onCreateTerminal={() => terminal.createTerminal(activeProject?.path)}
              onDestroyTerminal={terminal.destroyTerminal}
              onInput={terminal.sendInput}
              onResize={terminal.resizeTerminal}
              height={terminalHeight}
              onResizeHandle={handleTerminalResize}
              registerOutputCallback={terminal.registerOutputCallback}
            />

            {/* Input (always visible on desktop) */}
            <InputBar
              onSend={onSend}
              onInterrupt={onInterrupt}
              isProcessing={isProcessing}
              disabled={status !== "authenticated"}
              preferences={preferences}
              onUpdatePreference={onUpdatePreference}
              models={models}
              commands={commands}
              mcpServers={mcpServers}
              currentModel={currentModel}
              onSetModel={onSetModel}
              currentPermissionMode={currentPermissionMode}
              onSetPermissionMode={onSetPermissionMode}
              attachments={attachments}
              onAddAttachments={onAddAttachments}
              onRemoveAttachment={onRemoveAttachment}
              references={references}
              onRemoveReference={onRemoveReference}
            />
          </>
        )}

        {/* Mobile layout: full-screen tabs */}
        {isMobile && (
          <>
            {/* Content area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileTab === "chat" && (
                <main ref={scrollContainerRef} className="h-full overflow-y-auto p-4 [-webkit-overflow-scrolling:touch]">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="relative mb-6">
                        <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                          <Sparkles className="size-8 text-primary/60" />
                        </div>
                        <div className="absolute inset-0 size-16 rounded-2xl bg-primary/5 blur-xl" />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground/90 mb-2">
                        Ready to code
                      </h2>
                      <p className="text-sm text-muted-foreground/70 max-w-[240px] leading-relaxed">
                        Send a message to start a conversation with Claude Code
                      </p>
                      <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-[300px]">
                        {["Fix a bug", "Write a test", "Refactor code"].map((hint) => (
                          <button
                            key={hint}
                            onClick={() => onSend(hint)}
                            disabled={status !== "authenticated"}
                            className="px-3 py-1.5 rounded-full text-xs border border-(--color-overlay-border) text-muted-foreground hover:bg-(--color-overlay-hover) hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <MessageList messages={messages} onPermissionRespond={onPermissionRespond} />
                  <div ref={bottomRef} />
                </main>
              )}
              <TerminalPanel
                visible={mobileTab === "terminal"}
                terminals={terminal.terminals}
                activeTerminalId={terminal.activeTerminalId}
                onSetActive={terminal.setActiveTerminalId}
                onCreateTerminal={() => terminal.createTerminal(activeProject?.path)}
                onDestroyTerminal={terminal.destroyTerminal}
                onInput={terminal.sendInput}
                onResize={terminal.resizeTerminal}
                height={-1}
                onResizeHandle={() => {}}
                registerOutputCallback={terminal.registerOutputCallback}
              />
              {mobileTab === "preview" && (
                <WebPreview
                  detectedPorts={previewPorts.detectedPorts}
                  activePort={previewPorts.activePreviewPort}
                  onSelectPort={previewPorts.setActivePreviewPort}
                  customUrl={previewPorts.customPreviewUrl}
                  onSetCustomUrl={previewPorts.setCustomPreviewUrl}
                />
              )}
            </div>

            {/* Input (only in chat tab) */}
            {mobileTab === "chat" && (
              <InputBar
                onSend={onSend}
                onInterrupt={onInterrupt}
                isProcessing={isProcessing}
                disabled={status !== "authenticated"}
                preferences={preferences}
                onUpdatePreference={onUpdatePreference}
                models={models}
                commands={commands}
                mcpServers={mcpServers}
                currentModel={currentModel}
                onSetModel={onSetModel}
                currentPermissionMode={currentPermissionMode}
                onSetPermissionMode={onSetPermissionMode}
                attachments={attachments}
                onAddAttachments={onAddAttachments}
                onRemoveAttachment={onRemoveAttachment}
                references={references}
                onRemoveReference={onRemoveReference}
              />
            )}

            {/* Mobile Tab Bar */}
            <div className="flex items-center border-t border-(--color-overlay-border) bg-card/80 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]">
              {(
                [
                  { key: "chat" as MobileTab, icon: MessageSquare, label: "Chat" },
                  { key: "terminal" as MobileTab, icon: TerminalSquare, label: "Terminal" },
                  { key: "preview" as MobileTab, icon: Globe, label: "Preview" },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors cursor-pointer ${
                    mobileTab === key
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* File Explorer */}
      <FileExplorer
        activeProject={activeProject}
        token={token}
        isPinned={explorerPin.isPinned}
        isDesktop={explorerPin.isDesktop}
        isEffectivelyPinned={explorerPin.isEffectivelyPinned}
        onTogglePin={explorerPin.togglePin}
        sheetOpen={explorerOpen}
        onSheetOpenChange={setExplorerOpen}
        onAddReference={onAddReference}
      />
    </div>
  );
}
