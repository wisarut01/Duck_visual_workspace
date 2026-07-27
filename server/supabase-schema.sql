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

-- F1a: image uploads. NOT created automatically by app code — run this (or
-- create the bucket by hand in the Supabase dashboard: Storage > New bucket
-- > name "board-images" > Public bucket ON) before the "insert image" tool
-- will work. All writes go through the server's service-role key (via
-- src/lib/db.ts's uploadBoardImage), which bypasses RLS entirely, so the
-- insert policy below is belt-and-suspenders documentation of intent rather
-- than something the app's own uploads depend on; the public-read grant is
-- what actually matters, so a public URL loads for anyone (including a
-- signed-out board guest viewing the canvas).
insert into storage.buckets (id, name, public)
values ('board-images', 'board-images', true)
on conflict (id) do nothing;

-- CREATE POLICY has no IF NOT EXISTS clause in Postgres, so re-running this
-- file is guarded with DROP POLICY IF EXISTS first (safe/no-op on first run).
drop policy if exists "board-images public read" on storage.objects;
create policy "board-images public read"
  on storage.objects for select
  using (bucket_id = 'board-images');

drop policy if exists "board-images service-role write" on storage.objects;
create policy "board-images service-role write"
  on storage.objects for insert
  with check (bucket_id = 'board-images');
