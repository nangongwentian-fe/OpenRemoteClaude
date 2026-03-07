import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DATA_DIR = join(
  process.env.HOME || "~",
  ".remote-claude-code"
);

function ensureDataDir() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

export class DataStore {
  private db: Database;

  constructor() {
    ensureDataDir();
    this.db = new Database(join(DATA_DIR, "data.db"));
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
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

  getPasswordHash(): string | null {
    const row = this.db
      .query("SELECT value FROM config WHERE key = ?")
      .get("password_hash") as { value: string } | null;
    return row?.value ?? null;
  }

  setPasswordHash(hash: string) {
    this.db
      .query("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
      .run("password_hash", hash);
  }

  createSession(id: string, cwd: string) {
    this.db
      .query("INSERT INTO sessions (id, cwd) VALUES (?, ?)")
      .run(id, cwd);
  }

  completeSession(
    id: string,
    result: { isError: boolean; numTurns: number; durationMs: number }
  ) {
    this.db
      .query(
        "UPDATE sessions SET ended_at = unixepoch(), is_error = ?, num_turns = ?, duration_ms = ? WHERE id = ?"
      )
      .run(result.isError ? 1 : 0, result.numTurns, result.durationMs, id);
  }

  saveMessage(sessionId: string, role: string, content: unknown) {
    this.db
      .query(
        "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)"
      )
      .run(sessionId, role, JSON.stringify(content));
  }

  getRecentSessions(limit = 20) {
    return this.db
      .query("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?")
      .all(limit);
  }

  getSessionMessages(sessionId: string) {
    return this.db
      .query(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC"
      )
      .all(sessionId);
  }

  close() {
    this.db.close();
  }
}
