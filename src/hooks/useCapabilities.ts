import { useState, useCallback } from "react";
import type {
  ModelInfo,
  McpServerInfo,
  SlashCommandInfo,
  PermissionMode,
} from "../types/messages";

const MODELS_CACHE_KEY = "rcc_models";

function loadCachedModels(): ModelInfo[] {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached) {
      const models = JSON.parse(cached);
      if (Array.isArray(models) && models.length > 0) return models;
    }
  } catch {}
  return [];
}

export function useCapabilities(
  initialModel?: string,
  initialPermissionMode?: PermissionMode
) {
  const [models, setModels] = useState<ModelInfo[]>(loadCachedModels);
  const [commands, setCommands] = useState<SlashCommandInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [currentModel, setCurrentModel] = useState(initialModel || "");
  const [currentPermissionMode, setCurrentPermissionMode] = useState<PermissionMode>(
    initialPermissionMode || "acceptEdits"
  );

  const handleSystemInit = useCallback(
    (payload: {
      model?: string;
      permissionMode?: PermissionMode;
      mcpServers?: McpServerInfo[];
      slashCommands?: string[];
      skills?: string[];
    }) => {
      if (payload.model) setCurrentModel(payload.model);
      if (payload.permissionMode) setCurrentPermissionMode(payload.permissionMode);
      if (payload.mcpServers) setMcpServers(payload.mcpServers);
    },
    []
  );

  const handleCapabilities = useCallback(
    (payload: {
      models: ModelInfo[];
      commands: SlashCommandInfo[];
      mcpServers: McpServerInfo[];
    }) => {
      setModels(payload.models);
      setCommands(payload.commands);
      setMcpServers(payload.mcpServers);
      // 缓存模型列表到 localStorage
      try {
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(payload.models));
      } catch {}
    },
    []
  );

  return {
    models,
    commands,
    mcpServers,
    currentModel,
    currentPermissionMode,
    setCurrentModel,
    setCurrentPermissionMode,
    handleSystemInit,
    handleCapabilities,
  };
}
