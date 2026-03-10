import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import { DataStore } from "./db";
import { createAuthRoutes } from "./auth";
import { createWSHandlers, sessionManager, terminalManager, type WSState } from "./ws";
import { createThreadRoutes } from "./threads";
import { createUploadRoutes } from "./upload";
import { createProjectRoutes } from "./projects";
import { launchTunnel, getTunnelInfo, stopTunnel } from "./tunnel";
import { detectTailscale, getTailscaleInfo } from "./tailscale";
import { createPreviewRoutes } from "./preview";

import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "3456");
const ENABLE_TUNNEL = process.env.NO_TUNNEL !== "1";
const ENABLE_TAILSCALE = process.env.NO_TAILSCALE !== "1";
const VITE_PORT = 5173;
const IS_DEV = !existsSync("./dist/client/index.html");

// 初始化
const db = new DataStore();

// JWT_SECRET: 优先环境变量 > DB 持久化 > 新生成并存入 DB
const JWT_SECRET = (() => {
  if (process.env.RCC_JWT_SECRET) return process.env.RCC_JWT_SECRET;
  const stored = db.getJwtSecret();
  if (stored) return stored;
  const newSecret = crypto.randomUUID();
  db.setJwtSecret(newSecret);
  return newSecret;
})();
const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// 全局中间件
app.use("*", logger());
app.use("*", cors());

// 认证路由（公开）
app.route("/api/auth", createAuthRoutes(db, JWT_SECRET));

// 网络信息
app.get("/api/network", (c) =>
  c.json({ tunnel: getTunnelInfo(), tailscale: getTailscaleInfo() })
);
app.get("/api/tunnel", (c) => c.json(getTunnelInfo()));

// Thread 管理路由（需要 JWT）
app.route("/api/threads", createThreadRoutes(JWT_SECRET));

// 项目管理路由（需要 JWT）
app.route("/api/projects", createProjectRoutes(db, JWT_SECRET));

// 文件上传路由（需要 JWT）
app.route("/api", createUploadRoutes(JWT_SECRET));

// Web Preview 代理路由（需要 JWT）
app.route("/api/preview", createPreviewRoutes(JWT_SECRET));

// WebSocket 路由
const wsHandlers = createWSHandlers(JWT_SECRET, db);
app.get(
  "/ws",
  upgradeWebSocket((_c) => ({
    onOpen(_event, ws) {
      const raw = ws.raw as import("bun").ServerWebSocket<WSState>;
      Object.assign(raw.data, {
        authenticated: false,
        clientId: crypto.randomUUID(),
        activeSessionId: null,
      });
      wsHandlers.open(raw);
    },
    onMessage(event, ws) {
      const raw = ws.raw as import("bun").ServerWebSocket<WSState>;
      wsHandlers.message(raw, event.data as string);
    },
    onClose(_event, ws) {
      const raw = ws.raw as import("bun").ServerWebSocket<WSState>;
      wsHandlers.close(raw);
    },
  }))
);

// 生产环境：静态文件服务
app.use("/*", serveStatic({ root: "./dist/client" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

// 启动服务器
const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
  websocket: {
    ...websocket,
    // 使用应用层 ping/pong 保活，避免默认空闲超时在移动端/PWA 上误杀连接。
    idleTimeout: 0,
    sendPings: false,
  },
});
const listeningPort = server.port ?? PORT;

console.log(`[Server] Running at http://localhost:${listeningPort}`);

// 并行启动网络服务
const networkTasks: Promise<void>[] = [];

if (ENABLE_TAILSCALE) {
  networkTasks.push(
    detectTailscale(listeningPort)
      .then((info) => {
        if (info.isAvailable) {
          console.log(`[Tailscale] Detected: ${info.ip}${info.hostname ? ` (${info.hostname})` : ""}`);
        } else {
          console.log("[Tailscale] Not available");
        }
      })
      .catch(() => {})
  );
}

if (ENABLE_TUNNEL) {
  const tunnelPort = IS_DEV ? VITE_PORT : PORT;
  networkTasks.push(
    launchTunnel(tunnelPort)
      .then(() => {})
      .catch((err) => {
        console.warn(`[Tunnel] Failed: ${err.message}`);
      })
  );
}

// 全部完成后打印统一横幅
Promise.allSettled(networkTasks).then(() => {
  const lines: string[] = [];
  lines.push(`  Local:      http://localhost:${server.port}`);

  const ts = getTailscaleInfo();
  if (ts.isAvailable) {
    lines.push(`  Tailscale:  ${ts.url}`);
  }

  const tn = getTunnelInfo();
  if (tn.isRunning && tn.url) {
    lines.push(`  Tunnel:     ${tn.url}`);
  }

  const width = 42;
  console.log(`\n${"=".repeat(width)}`);
  console.log("  Remote Claude Code");
  console.log(`${"-".repeat(width)}`);
  for (const line of lines) console.log(line);
  console.log(`${"-".repeat(width)}`);
  console.log("  Open any URL above on your phone!");
  console.log(`${"=".repeat(width)}\n`);
});

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  terminalManager.destroyAll();
  sessionManager.dispose();
  stopTunnel();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  terminalManager.destroyAll();
  sessionManager.dispose();
  stopTunnel();
  db.close();
  process.exit(0);
});
