import { useRef, useState, useCallback, useEffect } from "react";
import type {
  ConnectionStatus,
  ServerMessage,
  ClientMessage,
  SessionPreferences,
  PermissionMode,
} from "../types/messages";

const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 30_000;

export function useWebSocket(
  token: string | null,
  onMessage: (msg: ServerMessage) => void,
  onAuthFailed?: () => void
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onAuthFailedRef = useRef(onAuthFailed);
  onAuthFailedRef.current = onAuthFailed;

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = undefined;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
  }, []);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const sendRaw = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;

    cleanup();
    setStatus("connecting");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempts.current = 0;
      // 发送认证
      ws.send(JSON.stringify({ type: "auth", token }));
      // 启动心跳
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "auth_result") {
          if (msg.payload.success) {
            setStatus("authenticated");
          } else {
            // 认证失败：阻止重连并通知上层清除无效 token
            reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS;
            ws.close();
            onAuthFailedRef.current?.();
            return;
          }
        }
        onMessageRef.current(msg);
      } catch {}
    };

    ws.onclose = () => {
      setStatus("disconnected");
      cleanup();
      // 自动重连
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts.current),
          30_000
        );
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose 会被调用，这里不需要额外处理
    };
  }, [token, cleanup, startHeartbeat]);

  const disconnect = useCallback(() => {
    cleanup();
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS; // 阻止重连
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, [cleanup]);

  const sendChat = useCallback(
    (
      prompt: string,
      cwd?: string,
      resumeSessionId?: string,
      options?: SessionPreferences
    ) => {
      sendRaw({
        type: "chat",
        payload: {
          prompt,
          cwd,
          resumeSessionId,
          ...(options?.model ? { model: options.model } : {}),
          ...(options?.effort ? { effort: options.effort } : {}),
          ...(options?.thinking ? { thinking: options.thinking } : {}),
          ...(options?.permissionMode ? { permissionMode: options.permissionMode } : {}),
        },
      });
    },
    [sendRaw]
  );

  const setModel = useCallback(
    (model: string) => {
      sendRaw({ type: "set_model", payload: { model } });
    },
    [sendRaw]
  );

  const setPermissionMode = useCallback(
    (mode: PermissionMode) => {
      sendRaw({ type: "set_permission_mode", payload: { mode } });
    },
    [sendRaw]
  );

  const requestCapabilities = useCallback((cwd?: string) => {
    sendRaw({ type: "request_capabilities", payload: cwd ? { cwd } : undefined });
  }, [sendRaw]);

  const interrupt = useCallback(() => {
    sendRaw({ type: "interrupt" });
  }, [sendRaw]);

  const abort = useCallback(() => {
    sendRaw({ type: "abort" });
  }, [sendRaw]);

  const sendPermissionResponse = useCallback(
    (requestId: string, behavior: "allow" | "deny") => {
      sendRaw({ type: "permission_response", payload: { requestId, behavior } });
    },
    [sendRaw]
  );

  // 页面可见性变化时暂停/恢复心跳，避免后台耗电
  useEffect(() => {
    const handleVisibility = () => {
      const ws = wsRef.current;
      if (document.hidden) {
        // 页面进入后台：暂停心跳
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = undefined;
        }
      } else if (ws?.readyState === WebSocket.OPEN) {
        // 页面回到前台且连接正常：恢复心跳
        startHeartbeat(ws);
      } else if (token && (!ws || ws.readyState === WebSocket.CLOSED)) {
        // 页面回到前台但连接已断开：重连
        reconnectAttempts.current = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [token, startHeartbeat, connect]);

  // token 变化时重新连接
  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  return {
    status,
    sendChat,
    interrupt,
    abort,
    disconnect,
    setModel,
    setPermissionMode,
    requestCapabilities,
    sendPermissionResponse,
    sendRaw,
  };
}
