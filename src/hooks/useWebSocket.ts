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
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
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
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "auth_result") {
          if (msg.payload.success) {
            setStatus("authenticated");
            // 认证成功后请求 capabilities（重连时也能获取 models）
            ws.send(JSON.stringify({ type: "request_capabilities" }));
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
  }, [token, cleanup]);

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

  const requestCapabilities = useCallback(() => {
    sendRaw({ type: "request_capabilities" });
  }, [sendRaw]);

  const interrupt = useCallback(() => {
    sendRaw({ type: "interrupt" });
  }, [sendRaw]);

  const abort = useCallback(() => {
    sendRaw({ type: "abort" });
  }, [sendRaw]);

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
    sendRaw,
  };
}
