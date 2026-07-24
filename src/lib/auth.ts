// Server-only auth helpers (epic 7). Passwords hashed with scrypt (Node
// built-in, no bcrypt dependency needed). Sessions are opaque random ids
// stored server-side in SQLite, not JWTs — easy to invalidate on logout.
import crypto from "crypto";
import { cookies } from "next/headers";
import {
  createSession,
  deleteSession,
  getSession,
  getUserById,
  type UserRow,
} from "./db";

const SESSION_COOKIE = "coboard_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export async function startSession(userId: string) {
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  createSession(id, userId, expiresAt);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) deleteSession(id);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = getSession(id);
  if (!session || session.expires_at < Date.now()) return null;
  return getUserById(session.user_id) ?? null;
}

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, color: u.color };
}
