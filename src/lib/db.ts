// Real backend store (epic 7). Originally SQLite via `node:sqlite`, moved
// to Supabase Postgres because Vercel's serverless functions have a
// read-only/ephemeral filesystem — a local .db file either fails to write
// or silently loses data across cold starts and instances (same class of
// bug as the relay's on-disk .ybin snapshots before that moved to Supabase
// too; see server/y-server.mjs). Server-only: never import from a client
// component.
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function createUser(u: Omit<UserRow, "created_at">): Promise<UserRow> {
  const created_at = Date.now();
  const { error } = await supabase.from("users").insert({ ...u, created_at });
  if (error) throw new Error(error.message);
  return { ...u, created_at };
}

export async function updateUserProfile(id: string, name: string, color: string) {
  const { error } = await supabase.from("users").update({ name, color }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createSession(id: string, userId: string, expiresAt: number) {
  const { error } = await supabase.from("sessions").insert({ id, user_id: userId, expires_at: expiresAt });
  if (error) throw new Error(error.message);
}

export async function getSession(id: string): Promise<{ id: string; user_id: string; expires_at: number } | undefined> {
  const { data, error } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function deleteSession(id: string) {
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listBoardsForOwner(ownerId: string): Promise<BoardRow[]> {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertBoard(id: string, ownerId: string, name: string) {
  // `id` is client-supplied (a shared room id), so this must never let a
  // plain upsert-by-primary-key reassign an existing row's owner_id to
  // whoever happens to visit that link next.
  const { data: existing, error: selectError } = await supabase
    .from("boards")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);

  const updated_at = Date.now();
  if (!existing) {
    const { error } = await supabase.from("boards").insert({ id, owner_id: ownerId, name, updated_at });
    if (error) throw new Error(error.message);
  } else if (existing.owner_id === ownerId) {
    const { error } = await supabase.from("boards").update({ name, updated_at }).eq("id", id).eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
  }
}

export async function deleteBoard(id: string, ownerId: string) {
  const { error } = await supabase.from("boards").delete().eq("id", id).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}
