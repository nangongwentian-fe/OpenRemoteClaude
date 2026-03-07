import { Hono } from "hono";
import { jwt } from "hono/jwt";
import {
  listSessions,
  getSessionMessages,
} from "@anthropic-ai/claude-agent-sdk";

export function createThreadRoutes(jwtSecret: string) {
  const threads = new Hono();

  threads.use("*", jwt({ secret: jwtSecret, alg: "HS256" }));

  // GET /api/threads — thread 列表
  threads.get("/", async (c) => {
    const limit = parseInt(c.req.query("limit") || "30");
    const sessions = await listSessions({ limit });

    return c.json({
      threads: sessions.map((s) => ({
        id: s.sessionId,
        title: s.customTitle || s.summary || s.firstPrompt?.slice(0, 60) || "New Thread",
        firstPrompt: s.firstPrompt,
        lastModified: s.lastModified,
        cwd: s.cwd,
      })),
    });
  });

  // GET /api/threads/:id/messages — thread 消息历史
  threads.get("/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const messages = await getSessionMessages(sessionId);

    return c.json({ messages });
  });

  return threads;
}
