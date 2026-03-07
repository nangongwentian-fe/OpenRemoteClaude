import { useState, useCallback } from "react";
import type {
  ModelInfo,
  McpServerInfo,
  SlashCommandInfo,
  PermissionMode,
} from "../types/messages";

export function useCapabilities() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [commands, setCommands] = useState<SlashCommandInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [currentPermissionMode, setCurrentPermissionMode] = useState<PermissionMode>("acceptEdits");

  const handleSystemInit = useCallback(
    (payload: {
      model?: string;
      permissionMode?: PermissionMode;
      mcpServers?: McpServerInfo[];
      slashCommands?: string[];
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
