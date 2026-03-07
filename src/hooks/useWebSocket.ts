import { useRef, useState, useCallback, useEffect } from "react";
import type {
  ConnectionStatus,
  ServerMessage,
  ClientMessage,
} from "../types/messages";

const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 30_000;

export function useWebSocket(
  token: string | null,
  onMessage: (msg: ServerMessage) => void
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

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
        if (msg.type === "auth_result" && msg.payload.success) {
          setStatus("authenticated");
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
    (prompt: string, cwd?: string, resumeSessionId?: string) => {
      sendRaw({ type: "chat", payload: { prompt, cwd, resumeSessionId } });
    },
    [sendRaw]
  );

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

  return { status, sendChat, interrupt, abort, disconnect };
}
