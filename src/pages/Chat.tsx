import { useRef, useEffect, useState } from "react";
import { Menu, MoreVertical, Plus, LogOut, Sparkles, Sun, Moon, Monitor, Check, FolderOpen, ChevronDown, Layers } from "lucide-react";
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
import { useSidebarPin } from "../hooks/useSidebarPin";
import type { ConnectionStatus, ChatMessage, Thread, ModelInfo, McpServerInfo, SlashCommandInfo, SessionPreferences, PermissionMode, Attachment, Project } from "../types/messages";
import type { Theme } from "../hooks/useTheme";

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
  // 能力与偏好
  preferences: SessionPreferences;
  onUpdatePreference: <K extends keyof SessionPreferences>(key: K, value: SessionPreferences[K]) => void;
  models: ModelInfo[];
  commands: SlashCommandInfo[];
  mcpServers: McpServerInfo[];
  currentModel: string;
  onSetModel: (model: string) => void;
  // 权限模式
  currentPermissionMode: PermissionMode;
  onSetPermissionMode: (mode: PermissionMode) => void;
  // 权限审批
  onPermissionRespond: (requestId: string, behavior: "allow" | "deny") => void;
  // 附件
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  // 项目
  activeProject: Project | null;
  projects: Project[];
  onSwitchProject: (project: Project | null) => void;
  onManageProjects: () => void;
  showProjectLabel: boolean;
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
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isPinned, isDesktop, isEffectivelyPinned, togglePin } = useSidebarPin();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
        <header className="flex items-center justify-between px-4 py-2 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] bg-card/80 backdrop-blur-md border-b border-(--color-overlay-border) min-h-[52px] relative z-10">
          <div className="flex items-center gap-3">
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
            <Badge variant="outline" className="gap-1.5 py-0.5 px-2 text-[11px] border-(--color-overlay-border) bg-(--color-overlay) font-normal">
              <span className={`size-1.5 rounded-full ${statusColor}`} />
              {statusText}
            </Badge>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-(--color-overlay-hover) transition-colors cursor-pointer absolute left-1/2 -translate-x-1/2 max-w-[50%]">
                <FolderOpen className="size-3.5 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground/90 tracking-tight truncate">
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
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto p-4 [-webkit-overflow-scrolling:touch]">
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

        {/* Input */}
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
        />
      </div>
    </div>
  );
}
