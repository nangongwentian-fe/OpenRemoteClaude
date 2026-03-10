import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import type { DataStore } from "./db";
import {
  clearPreviewSessionCookie,
  setPreviewSessionCookie,
} from "./auth-cookie";

const JWT_EXPIRY_HOURS = 72;

export function createAuthRoutes(db: DataStore, jwtSecret: string) {
  const auth = new Hono();

  // 检查是否已设置密码
  auth.get("/status", (c) => {
    const hash = db.getPasswordHash();
    return c.json({ initialized: hash !== null });
  });

  // 首次设置密码
  auth.post("/setup", async (c) => {
    if (db.getPasswordHash()) {
      return c.json({ error: "Password already set" }, 400);
    }

    const { password } = await c.req.json<{ password: string }>();
    if (!password || password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    const hash = await Bun.password.hash(password, { algorithm: "bcrypt" });
    db.setPasswordHash(hash);

    return c.json({ success: true });
  });

  // 登录
  auth.post("/login", async (c) => {
    const storedHash = db.getPasswordHash();
    if (!storedHash) {
      return c.json({ error: "Password not set. Run setup first." }, 400);
    }

    const { password } = await c.req.json<{ password: string }>();
    const valid = await Bun.password.verify(password, storedHash);
    if (!valid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const token = await sign(
      {
        sub: "remote-user",
        exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_HOURS * 3600,
      },
      jwtSecret,
      "HS256"
    );

    setPreviewSessionCookie(c, token);

    return c.json({ token });
  });

  // 使用 Bearer token 同步预览鉴权 cookie（用于无感迁移）
  auth.post("/session", async (c) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      await verify(token, jwtSecret, "HS256");
      setPreviewSessionCookie(c, token);
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  });

  // 退出登录并清理预览鉴权 cookie
  auth.post("/logout", (c) => {
    clearPreviewSessionCookie(c);
    return c.json({ success: true });
  });

  return auth;
}
