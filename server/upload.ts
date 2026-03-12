import { Hono } from "hono";
import { verify } from "hono/jwt";
import { join } from "path";
import { mkdir, readdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "node:os";

const UPLOAD_DIR = join(
  homedir(),
  ".remote-claude-code",
  "uploads"
);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const FILE_TTL = 24 * 60 * 60 * 1000; // 24h

// 启动时清理过期文件
async function cleanupExpiredFiles() {
  if (!existsSync(UPLOAD_DIR)) return;
  try {
    const files = await readdir(UPLOAD_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(UPLOAD_DIR, file);
      const s = await stat(filePath);
      if (now - s.mtimeMs > FILE_TTL) {
        await unlink(filePath);
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

// 启动时清理 + 每 6 小时周期清理
cleanupExpiredFiles();
setInterval(cleanupExpiredFiles, 6 * 60 * 60 * 1000);

export function createUploadRoutes(jwtSecret: string) {
  const app = new Hono();

  app.post("/upload", async (c) => {
    // JWT 鉴权
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      await verify(authHeader.slice(7), jwtSecret, "HS256");
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }

    // 解析 multipart
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 413);
    }

    // 确保上传目录存在
    await mkdir(UPLOAD_DIR, { recursive: true });

    // 保存文件
    const fileId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${fileId}-${safeName}`;
    const filePath = join(UPLOAD_DIR, fileName);

    await Bun.write(filePath, file);

    return c.json({
      fileId,
      filePath,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  });

  // 文件服务（用于前端图片预览等）
  app.get("/uploads/:filename", async (c) => {
    const filename = c.req.param("filename");

    // 防止路径穿越
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ error: "Invalid filename" }, 400);
    }

    const filePath = join(UPLOAD_DIR, filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return c.json({ error: "File not found" }, 404);
    }

    return new Response(file.stream(), {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  return app;
}
