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
const STALE_CONNECTION_THRESHOLD = 75_000;
const BACKGROUND_RECONNECT_THRESHOLD = 60_000;

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
  const statusRef = useRef<ConnectionStatus>("disconnected");
  const lastActivityAt = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const pendingMessagesRef = useRef<ClientMessage[]>([]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onAuthFailedRef = useRef(onAuthFailed);
  onAuthFailedRef.current = onAuthFailed;

  const updateStatus = useCallback((next: ConnectionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

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

  const isConnectionStale = useCallback(() => {
    if (!lastActivityAt.current) return false;
    return Date.now() - lastActivityAt.current > STALE_CONNECTION_THRESHOLD;
  }, []);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      if (!document.hidden && statusRef.current === "authenticated" && isConnectionStale()) {
        reconnectAttempts.current = 0;
        ws.close();
        return;
      }

      ws.send(JSON.stringify({ type: "ping" }));
    }, HEARTBEAT_INTERVAL);
  }, [isConnectionStale]);

  const flushPendingMessages = useCallback((ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (pendingMessagesRef.current.length === 0) return;

    const queued = [...pendingMessagesRef.current];
    pendingMessagesRef.current = [];

    for (const msg of queued) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;

    const previousWs = wsRef.current;
    if (
      previousWs &&
      (previousWs.readyState === WebSocket.OPEN
        || previousWs.readyState === WebSocket.CONNECTING)
    ) {
      previousWs.close();
    }

    cleanup();
    updateStatus("connecting");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close();
        return;
      }

      updateStatus("connected");
      reconnectAttempts.current = 0;
      lastActivityAt.current = Date.now();
      ws.send(JSON.stringify({ type: "auth", token }));
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;

      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        lastActivityAt.current = Date.now();

        if (msg.type === "auth_result") {
          if (msg.payload.success) {
            updateStatus("authenticated");
            flushPendingMessages(ws);
          } else {
            pendingMessagesRef.current = [];
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
      if (wsRef.current === ws) {
        wsRef.current = null;
      } else {
        return;
      }

      updateStatus("disconnected");
      cleanup();

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
  }, [cleanup, flushPendingMessages, startHeartbeat, token, updateStatus]);

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;

    if (
      ws?.readyState === WebSocket.OPEN &&
      statusRef.current === "authenticated" &&
      !isConnectionStale()
    ) {
      ws.send(JSON.stringify(msg));
      return;
    }

    pendingMessagesRef.current.push(msg);
    reconnectAttempts.current = 0;

    if (
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close();
      return;
    }

    connect();
  }, [connect, isConnectionStale]);

  const disconnect = useCallback(() => {
    cleanup();
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS; // 阻止重连
    pendingMessagesRef.current = [];
    lastActivityAt.current = 0;
    hiddenAt.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    updateStatus("disconnected");
  }, [cleanup, updateStatus]);

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

  const requestCapabilities = useCallback((cwd?: string, sessionId?: string) => {
    const payload = {
      ...(cwd ? { cwd } : {}),
      ...(sessionId ? { sessionId } : {}),
    };
    sendRaw({
      type: "request_capabilities",
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    });
  }, [sendRaw]);

  const interrupt = useCallback(() => {
    sendRaw({ type: "interrupt" });
  }, [sendRaw]);

  const abort = useCallback(() => {
    sendRaw({ type: "abort" });
  }, [sendRaw]);

  const sendPermissionResponse = useCallback(
    (requestId: string, behavior: "allow" | "deny", sessionId?: string) => {
      sendRaw({ type: "permission_response", payload: { requestId, behavior, sessionId } });
    },
    [sendRaw]
  );

  const reattachSession = useCallback((sessionId: string) => {
    sendRaw({ type: "reattach", payload: { sessionId } });
  }, [sendRaw]);

  // 手机后台恢复时优先判断连接是否已陈旧，必要时主动重连。
  useEffect(() => {
    const handleVisibility = () => {
      const ws = wsRef.current;
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }

      const hiddenDuration = hiddenAt.current
        ? Date.now() - hiddenAt.current
        : 0;
      hiddenAt.current = null;

      if (!token) return;

      if (!ws || ws.readyState === WebSocket.CLOSED) {
        reconnectAttempts.current = 0;
        connect();
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        if (
          hiddenDuration >= BACKGROUND_RECONNECT_THRESHOLD ||
          isConnectionStale()
        ) {
          reconnectAttempts.current = 0;
          ws.close();
          return;
        }

        startHeartbeat(ws);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [token, startHeartbeat, connect, isConnectionStale]);

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
    reattachSession,
    sendRaw,
  };
}
