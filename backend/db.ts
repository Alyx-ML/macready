import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";

export function getDB(projectDir: string): Database {
  const dbDir = process.env.GAMEDB_DIR || join(projectDir, ".gamedb");
  mkdirSync(dbDir, { recursive: true });
  
  const db = new Database(join(dbDir, "games.db"), { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const schema = `
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    platform TEXT,
    genre TEXT,
    store_url TEXT,
    steam_app_id TEXT,
    cover_art_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    macos_version TEXT,
    hardware TEXT,
    wine_version TEXT,
    crossover_version TEXT,
    gptk_version TEXT,
    launcher TEXT,
    play_method TEXT,
    translation_layer TEXT,
    graphics_preset TEXT,
    resolution TEXT,
    status TEXT NOT NULL CHECK(status IN (
      'native_arm','rosetta2','crossover_wine','gptk',
      'playable','issues','unsupported',
      'working','partial','broken','needs-workaround'
    )),
    fps TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('minor','major','critical','cosmetic')),
    workaround TEXT,
    resolved_by_version TEXT,
    resolved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS game_tags (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_hardware (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mac_model TEXT,
    chip TEXT,
    ram_gb INTEGER,
    gpu_cores INTEGER,
    macos_version TEXT,
    is_primary INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS passkey_credentials (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_tests_game ON tests(game_id);
  CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
  CREATE INDEX IF NOT EXISTS idx_tests_wine ON tests(wine_version);
  CREATE INDEX IF NOT EXISTS idx_tests_macos ON tests(macos_version);
  CREATE INDEX IF NOT EXISTS idx_issues_test ON issues(test_id);
  CREATE INDEX IF NOT EXISTS idx_issues_resolved ON issues(resolved);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_hardware_user ON user_hardware(user_id);
  CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id);
  `;
  
  db.exec(schema);

  // Migration: add columns if they don't exist (safe for existing DBs)
  const migrations = [
    "ALTER TABLE games ADD COLUMN steam_app_id TEXT",
    "ALTER TABLE games ADD COLUMN cover_art_url TEXT",
    "ALTER TABLE tests ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE tests ADD COLUMN gptk_version TEXT",
    "ALTER TABLE tests ADD COLUMN play_method TEXT",
    "ALTER TABLE tests ADD COLUMN translation_layer TEXT",
    "ALTER TABLE tests ADD COLUMN graphics_preset TEXT",
    "ALTER TABLE tests ADD COLUMN resolution TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  return db;
}
