import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

export type Db = Database.Database;

export function openDb(dbPath = path.join(env.DATA_DIR, 'app.sqlite')): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db: Db): void {
  const distMigrationUrl = new URL('./migrations/001_init.sql', import.meta.url);
  const sourceMigrationPath = path.resolve('src/db/migrations/001_init.sql');
  const migrationPath = fs.existsSync(distMigrationUrl) ? distMigrationUrl : sourceMigrationPath;
  const migration = fs.readFileSync(migrationPath, 'utf8');
  db.exec(migration);
}
