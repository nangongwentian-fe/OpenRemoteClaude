import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import { DataStore } from "./db";
import { createAuthRoutes } from "./auth";
import { createWSHandlers, sessionManager, type WSState } from "./ws";
import { createThreadRoutes } from "./threads";
import { createUploadRoutes } from "./upload";
import { createProjectRoutes } from "./projects";
import { launchTunnel, getTunnelInfo, stopTunnel } from "./tunnel";

import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "3456");
const ENABLE_TUNNEL = process.env.NO_TUNNEL !== "1";
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

// 隧道信息
app.get("/api/tunnel", (c) => c.json(getTunnelInfo()));

// Thread 管理路由（需要 JWT）
app.route("/api/threads", createThreadRoutes(JWT_SECRET));

// 项目管理路由（需要 JWT）
app.route("/api/projects", createProjectRoutes(db, JWT_SECRET));

// 文件上传路由（需要 JWT）
app.route("/api", createUploadRoutes(JWT_SECRET));

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
  websocket,
});

console.log(`[Server] Running at http://localhost:${server.port}`);

// 启动 Cloudflare Tunnel
if (ENABLE_TUNNEL) {
  // dev 模式下指向 Vite 端口（Vite 已配置 proxy 转发 /api 和 /ws）
  const tunnelPort = IS_DEV ? VITE_PORT : PORT;
  launchTunnel(tunnelPort)
    .then((url) => {
      console.log(`\n========================================`);
      console.log(`  Remote access: ${url}`);
      console.log(`  Open this URL on your phone!`);
      console.log(`========================================\n`);
    })
    .catch((err) => {
      console.warn(
        `[Tunnel] Failed to start: ${err.message}`
      );
      console.warn(
        "[Tunnel] You can still access locally at http://localhost:" +
          server.port
      );
      console.warn(
        "[Tunnel] Set NO_TUNNEL=1 to disable tunnel on startup"
      );
    });
}

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  sessionManager.dispose();
  stopTunnel();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  sessionManager.dispose();
  stopTunnel();
  db.close();
  process.exit(0);
});
