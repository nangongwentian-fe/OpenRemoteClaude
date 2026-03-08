import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { readdirSync, statSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import type { DataStore } from "./db";

const HIDDEN_DIRS = new Set([
  "node_modules",
  ".git",
  ".DS_Store",
  "__pycache__",
  ".cache",
  ".Trash",
  ".vscode",
  ".idea",
]);

export function createProjectRoutes(db: DataStore, jwtSecret: string) {
  const app = new Hono();

  app.use("*", jwt({ secret: jwtSecret, alg: "HS256" }));

  // GET /api/projects — 获取项目列表
  app.get("/", (c) => {
    return c.json({ projects: db.getProjects() });
  });

  // POST /api/projects — 添加项目
  app.post("/", async (c) => {
    const body = await c.req.json<{ path: string; name?: string }>();
    const absPath = resolve(body.path);

    if (!existsSync(absPath)) {
      return c.json({ error: "Path does not exist" }, 400);
    }
    const stat = statSync(absPath);
    if (!stat.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400);
    }

    const projects = db.getProjects();
    if (projects.some((p) => p.path === absPath)) {
      return c.json({ error: "Project already exists" }, 409);
    }

    const name = body.name || basename(absPath);
    const project = { path: absPath, name, addedAt: Date.now() };
    projects.push(project);
    db.setProjects(projects);

    return c.json({ project });
  });

  // DELETE /api/projects — 删除项目
  app.delete("/", async (c) => {
    const body = await c.req.json<{ path: string }>();
    const projects = db.getProjects();
    const filtered = projects.filter((p) => p.path !== body.path);

    if (filtered.length === projects.length) {
      return c.json({ error: "Project not found" }, 404);
    }

    db.setProjects(filtered);
    return c.json({ ok: true });
  });

  // POST /api/projects/mkdir — 创建文件夹
  app.post("/mkdir", async (c) => {
    const body = await c.req.json<{ parent: string; name: string }>();
    const name = body.name?.trim();

    if (!name || name.length > 255 || /[\/\\\0]/.test(name) || name.startsWith(".") || name.includes("..")) {
      return c.json({ error: "Invalid folder name" }, 400);
    }

    const absParent = resolve(body.parent);
    if (!existsSync(absParent) || !statSync(absParent).isDirectory()) {
      return c.json({ error: "Parent path does not exist or is not a directory" }, 400);
    }

    const targetPath = join(absParent, name);
    if (existsSync(targetPath)) {
      return c.json({ error: "A file or folder with this name already exists" }, 400);
    }

    try {
      mkdirSync(targetPath);
    } catch {
      return c.json({ error: "Failed to create folder" }, 403);
    }

    return c.json({ ok: true, path: targetPath });
  });

  // POST /api/projects/rmdir — 删除文件夹
  app.post("/rmdir", async (c) => {
    const body = await c.req.json<{ path: string; force?: boolean }>();
    const absPath = resolve(body.path);

    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      return c.json({ error: "Path does not exist or is not a directory" }, 400);
    }

    if (absPath === "/" || absPath === process.env.HOME) {
      return c.json({ error: "Cannot delete protected directory" }, 403);
    }

    const projects = db.getProjects();
    if (projects.some((p) => p.path === absPath)) {
      return c.json({ error: "Cannot delete a registered project directory. Remove it from projects first." }, 400);
    }

    if (!body.force) {
      try {
        const contents = readdirSync(absPath);
        if (contents.length > 0) {
          return c.json({ error: "Directory is not empty", count: contents.length }, 400);
        }
      } catch {
        return c.json({ error: "Cannot read directory" }, 403);
      }
    }

    try {
      rmSync(absPath, { recursive: true });
    } catch {
      return c.json({ error: "Failed to delete folder" }, 403);
    }

    return c.json({ ok: true });
  });

  // GET /api/projects/browse?path=/Users — 目录浏览
  app.get("/browse", (c) => {
    const rawPath = c.req.query("path") || process.env.HOME || "/";
    const absPath = resolve(rawPath);

    if (!existsSync(absPath)) {
      return c.json({ error: "Path does not exist" }, 400);
    }

    const stat = statSync(absPath);
    if (!stat.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400);
    }

    let entries: Array<{
      name: string;
      isDirectory: boolean;
      isGitRepo: boolean;
    }> = [];

    try {
      const items = readdirSync(absPath);
      for (const name of items) {
        if (name.startsWith(".") || HIDDEN_DIRS.has(name)) continue;
        try {
          const fullPath = join(absPath, name);
          const s = statSync(fullPath);
          if (s.isDirectory()) {
            const isGitRepo = existsSync(join(fullPath, ".git"));
            entries.push({ name, isDirectory: true, isGitRepo });
          }
        } catch {
          // skip inaccessible entries
        }
      }
    } catch {
      return c.json({ error: "Cannot read directory" }, 403);
    }

    entries.sort((a, b) => {
      // git repos first, then alphabetical
      if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parent = absPath === "/" ? null : dirname(absPath);

    return c.json({ current: absPath, parent, entries });
  });

  return app;
}
