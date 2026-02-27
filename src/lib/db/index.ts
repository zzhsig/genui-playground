import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Singleton to prevent multiple connections during build
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof drizzle> };

function createDb() {
  const sqlite = new Database(path.join(dbDir, "genui.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  // Auto-create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      background TEXT DEFAULT '#ffffff',
      dark INTEGER DEFAULT 0,
      blocks TEXT NOT NULL,
      actions TEXT,
      parent_id TEXT REFERENCES slides(id),
      main_child_id TEXT,
      source_prompt TEXT,
      conversation_history TEXT,
      created_at INTEGER
    );
  `);

  // Migration: add source_prompt column to existing DBs
  try {
    sqlite.exec(`ALTER TABLE slides ADD COLUMN source_prompt TEXT;`);
  } catch {
    // Column already exists
  }

  sqlite.exec(`

    CREATE TABLE IF NOT EXISTS slide_links (
      id TEXT PRIMARY KEY,
      from_slide_id TEXT NOT NULL REFERENCES slides(id),
      to_slide_id TEXT NOT NULL REFERENCES slides(id),
      created_at INTEGER,
      UNIQUE(from_slide_id, to_slide_id)
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      slide_id TEXT NOT NULL REFERENCES slides(id),
      selected_text TEXT NOT NULL,
      block_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER
    );
  `);

  return drizzle(sqlite, { schema });
}

if (!globalForDb.__db) {
  globalForDb.__db = createDb();
}

export const db = globalForDb.__db;
export { schema };
