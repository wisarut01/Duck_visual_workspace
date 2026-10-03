# Coboard

A real-time collaborative whiteboard. Boards hold sticky notes, shapes, text,
frames, connectors and images; everyone with the link edits together with live
cursors and presence. Guests can join a board without an account; accounts
unlock a personal dashboard of boards.

Stack: Next.js 16 + React 19 (app), Yjs (CRDT), a small Node WebSocket relay
(`server/y-server.mjs`), and Supabase (Postgres for users/sessions/boards and
board snapshots, Storage for images).

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values below.
3. Create the tables once: run `server/supabase-schema.sql` in the Supabase SQL Editor.
4. In two terminals:
   - `npm run ws-server` (relay, default `ws://localhost:1234`)
   - `npm run dev` (app, http://localhost:3000)

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | app + relay | Supabase project URL (must be a valid http(s) URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | app + relay | Service-role key; server-side only, never expose to the browser |
| `NEXT_PUBLIC_WS_URL` | browser | Relay URL; defaults to `ws://localhost:1234` |
| `PORT` / `Y_WS_PORT` | relay | Listen port (default 1234) |

Tests and checks: `npm test`, `npx tsc --noEmit`, `npx eslint .`.

## Deployment

### Supabase

Create a project, then run `server/supabase-schema.sql` in the SQL Editor. The
file is safe to re-run. It creates the tables, enables Row Level Security with
no policies (the app only uses the service-role key, which bypasses RLS, so the
public anon key can access nothing), and creates the public `board-images`
storage bucket.

### Relay on Render

`render.yaml` defines the `coboard-relay` web service (`node server/y-server.mjs`).
Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Render dashboard.
Render provides `PORT`. The free tier sleeps after about 15 minutes idle, so
the first visit afterwards is slow to connect.

### App on Vercel

Set these environment variables for the Production environment, then redeploy:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_WS_URL=wss://<relay-host>`

`NEXT_PUBLIC_WS_URL` is inlined at build time. If it is missing, the client
falls back to `ws://localhost:1234` and collaboration silently does not work
for anyone but you. It must be set before the build, so redeploy after adding it.

### Sharing a board

Visitors do not need a Vercel account. Share the production domain
(e.g. `https://your-app.vercel.app/board/<room>`), not a per-deployment URL:
deployment-specific URLs can sit behind Vercel's deployment protection and ask
visitors to log in to Vercel.

Room ids are `adjective-noun-<10 random chars>`; anyone with the link can edit,
so treat the link as the secret.
