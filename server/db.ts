import { Database, type Statement } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const DATA_DIR = join(
  homedir(),
  ".remote-claude-code"
);

function ensureDataDir() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

export class DataStore {
  private db: Database;
  private stmts: {
    getConfig: Statement;
    setConfig: Statement;
    createSession: Statement;
    completeSession: Statement;
    saveMessage: Statement;
    getRecentSessions: Statement;
    getSessionMessages: Statement;
  };

  constructor() {
    ensureDataDir();
    this.db = new Database(join(DATA_DIR, "data.db"));
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
    this.stmts = this.prepareStatements();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        started_at INTEGER DEFAULT (unixepoch()),
        ended_at INTEGER,
        is_error INTEGER DEFAULT 0,
        num_turns INTEGER DEFAULT 0,
        duration_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    `);
  }

  private prepareStatements() {
    return {
      getConfig: this.db.query("SELECT value FROM config WHERE key = ?"),
      setConfig: this.db.query("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)"),
      createSession: this.db.query("INSERT OR IGNORE INTO sessions (id, cwd) VALUES (?, ?)"),
      completeSession: this.db.query("UPDATE sessions SET ended_at = unixepoch(), is_error = ?, num_turns = ?, duration_ms = ? WHERE id = ?"),
      saveMessage: this.db.query("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)"),
      getRecentSessions: this.db.query("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?"),
      getSessionMessages: this.db.query("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC"),
    };
  }

  getPasswordHash(): string | null {
    const row = this.stmts.getConfig.get("password_hash") as { value: string } | null;
    return row?.value ?? null;
  }

  setPasswordHash(hash: string) {
    this.stmts.setConfig.run("password_hash", hash);
  }

  createSession(id: string, cwd: string) {
    this.stmts.createSession.run(id, cwd);
  }

  completeSession(
    id: string,
    result: { isError: boolean; numTurns: number; durationMs: number }
  ) {
    this.stmts.completeSession.run(result.isError ? 1 : 0, result.numTurns, result.durationMs, id);
  }

  saveMessage(sessionId: string, role: string, content: unknown) {
    this.stmts.saveMessage.run(sessionId, role, JSON.stringify(content));
  }

  getJwtSecret(): string | null {
    const row = this.stmts.getConfig.get("jwt_secret") as { value: string } | null;
    return row?.value ?? null;
  }

  setJwtSecret(secret: string) {
    this.stmts.setConfig.run("jwt_secret", secret);
  }

  getProjects(): Array<{ path: string; name: string; addedAt: number }> {
    const row = this.stmts.getConfig.get("projects") as { value: string } | null;
    return row ? JSON.parse(row.value) : [];
  }

  setProjects(projects: Array<{ path: string; name: string; addedAt: number }>) {
    this.stmts.setConfig.run("projects", JSON.stringify(projects));
  }

  getRecentSessions(limit = 20) {
    return this.stmts.getRecentSessions.all(limit);
  }

  getSessionMessages(sessionId: string) {
    return this.stmts.getSessionMessages.all(sessionId);
  }

  close() {
    this.db.close();
  }
}
