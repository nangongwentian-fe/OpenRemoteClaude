import { Hono } from "hono";
import { sign } from "hono/jwt";
import type { DataStore } from "./db";

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

    return c.json({ token });
  });

  return auth;
}
