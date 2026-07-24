-- Auth/boards tables (epic 7), moved off local SQLite because Vercel's
-- serverless functions can't persist a file to disk. Run this once in the
-- Supabase SQL Editor before deploying.

create table if not exists board_snapshots (
  room_id text primary key,
  data bytea not null,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  color text not null,
  password_hash text not null,
  password_salt text not null,
  created_at bigint not null
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id),
  expires_at bigint not null
);

create table if not exists boards (
  id text primary key,
  owner_id text not null references users(id),
  name text not null,
  updated_at bigint not null
);

create index if not exists boards_owner_id_idx on boards(owner_id);
