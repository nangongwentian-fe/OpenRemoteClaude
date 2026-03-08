import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { readdirSync, statSync, existsSync } from "node:fs";
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
