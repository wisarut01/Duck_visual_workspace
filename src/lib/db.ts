// Real backend store (epic 7) — SQLite via Node's built-in `node:sqlite`
// (no native dependency to install, in keeping with this project's
// self-hosted-over-managed-service approach; see server/y-server.mjs).
// Server-only: never import this from a client component.
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// A fresh DatabaseSync per module load is fine here: Next.js dev server
// keeps this module cached across requests (only re-evaluated on file
// change), and route handlers run in the same Node process, not per-request
// isolates.
const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
`);

export interface UserRow {
  id: string;
  email: string;
  name: string;
  color: string;
  password_hash: string;
  password_salt: string;
  created_at: number;
}

export interface BoardRow {
  id: string;
  owner_id: string;
  name: string;
  updated_at: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function getUserByEmail(email: string): UserRow | undefined {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  return row;
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(u: Omit<UserRow, "created_at">): UserRow {
  const created_at = Date.now();
  db.prepare(
    "INSERT INTO users (id, email, name, color, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(u.id, u.email, u.name, u.color, u.password_hash, u.password_salt, created_at);
  return { ...u, created_at };
}

export function updateUserProfile(id: string, name: string, color: string) {
  db.prepare("UPDATE users SET name = ?, color = ? WHERE id = ?").run(name, color, id);
}

export function createSession(id: string, userId: string, expiresAt: number) {
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expiresAt);
}

export function getSession(id: string): { id: string; user_id: string; expires_at: number } | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: string; user_id: string; expires_at: number }
    | undefined;
}

export function deleteSession(id: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function listBoardsForOwner(ownerId: string): BoardRow[] {
  return db
    .prepare("SELECT * FROM boards WHERE owner_id = ? ORDER BY updated_at DESC")
    .all(ownerId) as BoardRow[];
}

export function upsertBoard(id: string, ownerId: string, name: string) {
  const existing = db.prepare("SELECT id FROM boards WHERE id = ?").get(id) as { id: string } | undefined;
  const updated_at = Date.now();
  if (existing) {
    db.prepare("UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?").run(
      name,
      updated_at,
      id,
      ownerId,
    );
  } else {
    db.prepare("INSERT INTO boards (id, owner_id, name, updated_at) VALUES (?, ?, ?, ?)").run(
      id,
      ownerId,
      name,
      updated_at,
    );
  }
}

export function deleteBoard(id: string, ownerId: string) {
  db.prepare("DELETE FROM boards WHERE id = ? AND owner_id = ?").run(id, ownerId);
}
