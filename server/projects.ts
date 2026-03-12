import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { readdirSync, statSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname, basename, resolve, extname, sep, parse } from "node:path";
import { homedir } from "node:os";
import type { DataStore } from "./db";

/** 跨平台检查是否为根目录（Unix: "/", Windows: "C:\" 等） */
function isRootPath(absPath: string): boolean {
  return parse(absPath).root === absPath;
}

/** 根目录或用户主目录均为受保护路径 */
function isProtectedPath(absPath: string): boolean {
  return isRootPath(absPath) || absPath === homedir();
}

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

const HIDDEN_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".env",
  ".env.local",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const EXTENSION_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rs: "rust", go: "go", java: "java", rb: "ruby",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  css: "css", scss: "scss", less: "less", html: "html",
  json: "json", md: "markdown", yaml: "yaml", yml: "yaml",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  sql: "sql", xml: "xml", svg: "xml", toml: "toml",
  vue: "vue", svelte: "svelte", astro: "astro",
  dockerfile: "dockerfile", makefile: "makefile",
};

function getLanguage(filename: string): string {
  const ext = extname(filename).slice(1).toLowerCase();
  if (EXTENSION_LANG[ext]) return EXTENSION_LANG[ext];
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  return "plaintext";
}

function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function isWithinProject(absPath: string, projects: Array<{ path: string }>): boolean {
  return projects.some((p) => absPath === p.path || absPath.startsWith(p.path + sep));
}

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

    if (isProtectedPath(absPath)) {
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

  // GET /api/projects/tree?path=... — 文件树列表（文件+文件夹）
  app.get("/tree", (c) => {
    const rawPath = c.req.query("path");
    if (!rawPath) {
      return c.json({ error: "path parameter is required" }, 400);
    }
    const absPath = resolve(rawPath);

    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      return c.json({ error: "Path does not exist or is not a directory" }, 400);
    }

    const projects = db.getProjects();
    if (!isWithinProject(absPath, projects)) {
      return c.json({ error: "Path is not within a registered project" }, 403);
    }

    const entries: Array<{
      name: string;
      isDirectory: boolean;
      size: number;
      extension: string;
    }> = [];

    try {
      const items = readdirSync(absPath, { withFileTypes: true });
      for (const dirent of items) {
        const name = dirent.name;
        if (HIDDEN_DIRS.has(name) || HIDDEN_FILES.has(name)) continue;
        if (name.startsWith(".")) continue;
        try {
          if (dirent.isDirectory()) {
            entries.push({ name, isDirectory: true, size: 0, extension: "" });
          } else if (dirent.isFile()) {
            const ext = extname(name).slice(1).toLowerCase();
            const s = statSync(join(absPath, name));
            entries.push({ name, isDirectory: false, size: s.size, extension: ext });
          }
        } catch {
          // skip inaccessible
        }
      }
    } catch {
      return c.json({ error: "Cannot read directory" }, 403);
    }

    // 文件夹在前，再按字母排序
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const parent = isRootPath(absPath) ? null : dirname(absPath);
    return c.json({ current: absPath, parent, entries });
  });

  // GET /api/projects/file?path=... — 读取文件内容
  app.get("/file", (c) => {
    const rawPath = c.req.query("path");
    if (!rawPath) {
      return c.json({ error: "path parameter is required" }, 400);
    }
    const absPath = resolve(rawPath);

    const projects = db.getProjects();
    if (!isWithinProject(absPath, projects)) {
      return c.json({ error: "Path is not within a registered project" }, 403);
    }

    if (!existsSync(absPath)) {
      return c.json({ error: "File does not exist" }, 404);
    }

    const stat = statSync(absPath);
    if (!stat.isFile()) {
      return c.json({ error: "Path is not a file" }, 400);
    }

    if (stat.size > MAX_FILE_SIZE) {
      return c.json({ error: "File too large", size: stat.size, maxSize: MAX_FILE_SIZE }, 413);
    }

    try {
      const buffer = readFileSync(absPath);
      if (isBinary(buffer)) {
        return c.json({ error: "Binary file cannot be displayed" }, 415);
      }
      const content = buffer.toString("utf-8");
      const lineCount = content.split("\n").length;
      const language = getLanguage(basename(absPath));

      return c.json({
        path: absPath,
        name: basename(absPath),
        content,
        language,
        lineCount,
      });
    } catch {
      return c.json({ error: "Cannot read file" }, 403);
    }
  });

  // POST /api/projects/file — 新建文件
  app.post("/file", async (c) => {
    const body = await c.req.json<{ parent: string; name: string; content?: string }>();
    const name = body.name?.trim();

    if (!name || name.length > 255 || /[\/\\\0]/.test(name) || name.includes("..")) {
      return c.json({ error: "Invalid file name" }, 400);
    }

    const absParent = resolve(body.parent);
    const projects = db.getProjects();
    if (!isWithinProject(absParent, projects)) {
      return c.json({ error: "Path is not within a registered project" }, 403);
    }

    if (!existsSync(absParent) || !statSync(absParent).isDirectory()) {
      return c.json({ error: "Parent path does not exist or is not a directory" }, 400);
    }

    const targetPath = join(absParent, name);
    if (existsSync(targetPath)) {
      return c.json({ error: "A file or folder with this name already exists" }, 400);
    }

    try {
      writeFileSync(targetPath, body.content || "");
    } catch {
      return c.json({ error: "Failed to create file" }, 403);
    }

    return c.json({ ok: true, path: targetPath });
  });

  // DELETE /api/projects/file — 删除文件
  app.delete("/file", async (c) => {
    const body = await c.req.json<{ path: string }>();
    const absPath = resolve(body.path);

    const projects = db.getProjects();
    if (!isWithinProject(absPath, projects)) {
      return c.json({ error: "Path is not within a registered project" }, 403);
    }

    if (!existsSync(absPath)) {
      return c.json({ error: "File does not exist" }, 404);
    }

    if (!statSync(absPath).isFile()) {
      return c.json({ error: "Path is not a file" }, 400);
    }

    try {
      unlinkSync(absPath);
    } catch {
      return c.json({ error: "Failed to delete file" }, 403);
    }

    return c.json({ ok: true });
  });

  // GET /api/projects/browse?path=/Users — 目录浏览
  app.get("/browse", (c) => {
    const rawPath = c.req.query("path") || homedir();
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

    const parent = isRootPath(absPath) ? null : dirname(absPath);

    return c.json({ current: absPath, parent, entries });
  });

  return app;
}
