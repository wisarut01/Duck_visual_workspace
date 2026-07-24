@AGENTS.md

## Progress log (update as work continues)

Done — epics 1-5 (canvas core, Next.js shell, local Y.Doc, WS realtime, presence/follow).

Done — polish batch (this session):
- Frame resize handles (was broken, fixed)
- Shape resize handles + auto-grow to text (ResizeObserver)
- Font size + family (sans/mono) toolbar on note/shape/text
- Curved arrows, drag-adjustable curvature
- Arrow move-whole-line + drag endpoints after creation (was broken, fixed)
- Hover-near-shape auto arrow anchor (Miro-style)
- Room naming, synced via Yjs `meta` map
- `/dashboard` page — board list, local-only (localStorage, `lib/boards.ts`)
- `/profile` page — name/color, local-only (localStorage, `lib/profile.ts`)
- Scope decision: dashboard/profile are localStorage mocks, NOT real backend/auth (user chose this explicitly over real DB+auth)

Done — Epic 6 persistence (this session):
- `server/y-server.mjs`: each room's Y.Doc snapshotted to `server/data/<roomId>.ybin` (debounced 1s on update, flushed immediately when last client leaves a room)
- Room reloads from disk file on next open — verified restarting the relay process no longer wipes room content
- roomId sanitized before use as filename (path traversal guard)
- `server/data/*.ybin` gitignored (local snapshot store, not committed)

Done — Epic 7 real auth + backend (this session, superseding the earlier local-only mock decision):
- `src/lib/db.ts` — SQLite via Node's built-in `node:sqlite` (no native dep to install), file at `data/app.db` (gitignored). Tables: `users`, `sessions`, `boards`.
- `src/lib/auth.ts` — scrypt password hashing (Node built-in, no bcrypt dep), opaque random session ids stored server-side (not JWT, so logout actually invalidates), httpOnly cookie `coboard_session`.
- API routes: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET`/`PATCH /api/auth/me`, `GET`/`POST /api/boards`, `DELETE /api/boards/[id]` — all in `src/app/api/`.
- `src/lib/api.ts` — client fetch wrapper for all of the above.
- New pages: `/login`, `/register`. `/profile` and `/dashboard` rewritten to require a real session (redirect to `/login?next=...` if not signed in) and read/write through the API instead of localStorage.
- `src/lib/boards.ts` (old localStorage dashboard registry) deleted, replaced by `src/lib/api.ts` + the `boards` table.
- `src/lib/profile.ts` (localStorage) kept but narrowed to guest-join prefill only (JoinCard) — joining a board still never requires an account; only the dashboard/profile pages do.
- `src/types/node-sqlite.d.ts` — hand-written ambient types for `node:sqlite`, since `@types/node@20` doesn't ship them yet (module is still experimental in Node 22).
- Verified via `npx tsc --noEmit`, `npx eslint .`, `npm run build` (all clean), and a `next start` + curl smoke test covering: register, duplicate-email rejection, session cookie auth, unauthenticated 401s, wrong-password rejection, board create/list/delete, profile update, logout invalidating the session.

Done — public deploy + Supabase migration (this session):
- Moved off local-disk storage entirely (both epic 6's `.ybin` files and epic 7's SQLite `data/app.db`) — neither survives Vercel's read-only/ephemeral serverless filesystem, which is what "deploy for real" surfaced.
- `server/y-server.mjs` snapshots now go to Supabase table `board_snapshots` (bytea column) instead of disk. Bug caught + fixed during testing: a raw `Buffer` passed straight to `@supabase/supabase-js` JSON-serializes as `{type:"Buffer",data:[...]}` instead of a bytea literal, silently corrupting every save — must hex-encode with a `\x` prefix first. Also hardened `loadDoc`/`getRoom` so a corrupt/undecodable snapshot logs and starts fresh instead of crashing the whole relay process (it was an unhandled promise rejection before).
- `src/lib/db.ts` rewritten from `node:sqlite` to Supabase (same project, tables `users`/`sessions`/`boards`, schema in `server/supabase-schema.sql`). All callers in `src/lib/auth.ts` and the `/api/auth/*`, `/api/boards*` routes updated to `await` the now-async db functions. `src/types/node-sqlite.d.ts` deleted (unused).
- Caught + fixed a real authorization gap this migration would have introduced: `upsertBoard`'s `id` is client-supplied (shared room links), so a naive Supabase `upsert()` keyed on `id` would let a second user's visit reassign an existing board row's `owner_id` to themselves. Restored the original SQLite version's owner-scoped update-or-insert semantics explicitly.
- Relay now honors `$PORT` (falls back to `Y_WS_PORT`/1234 locally) — required for Render and most PaaS hosts, which assign the port dynamically. `render.yaml` blueprint added for one-click relay deploy.
- Deployed: relay on Render (free tier — sleeps after ~15min idle, no hard connection cap in the code itself), app on Vercel. Both wired to the same Supabase project.
- Fixed a mobile-only bug hit during real-device testing: `JoinCard`'s submit button could be tapped before hydration attached the `onSubmit` handler (dev-mode bundles are slow to hydrate on phone CPUs/networks), falling through to a real uninterrupted form GET that looked like an infinite bounce back to the join screen. Fixed by gating the button on `useSyncExternalStore`'s hydrated flag (SSR-renders `disabled`, so there's no window where a tap can misfire) rather than a `useEffect` + `setState` (which also would've tripped the `react-hooks/set-state-in-effect` lint rule).
- Added "join someone else's board" on `/dashboard` — paste a shared link or bare room id, it resolves via `parseRoomId()` and bookmarks + opens it.
- Added a Share button to the board topbar (copies the current URL).

Done — canvas polish batch (this session):
- Diamond shape text was rendering rotated 45° — the CSS counter-rotation selector (`.shape.diamond .body`) targeted a class that doesn't exist; the actual element is `.shapeBody`. Fixed. (The 4 hover-anchor dots are a separate, still-open cosmetic gap — see below.)
- Font size toolbar cap raised 40 → 96.
- Arrow endpoint drop-to-snap was a strict point-in-rect test with zero tolerance against the target shape, so it rarely triggered unless the release pixel landed exactly inside the shape's bounds. Padded the hit-test ~28 screen px (scaled by zoom).
- Arrows had no thickness property at all (hardcoded `strokeWidth={2.5}`). Added `ArrowData.strokeWidth` + a 4-preset picker (thin/normal/thick/heavy) shown on the selected arrow.

Not done — remaining for full product (see `../SUMMARY.md` §4 for original list):
- Epic 8: general polish — pen tool, comment threads, dot-voting, workshop timer, emoji reactions, multi-select, minimap, presentation mode, pinch-zoom, duplicate/z-order.
- `body`/`label` fields still plain strings not `Y.Text` — concurrent same-object typing is last-writer-wins, not merged.
- Known cosmetic gap: diamond shape's 4 hover-anchor dots (not the text — that part's fixed) still inherit the shape's 45° CSS rotation, so they sit slightly off true N/E/S/W points. Accepted trade-off, not fixed.
- No admin/human-readable view into `board_snapshots` content — it's a binary Yjs blob; the only way to inspect a room's content is to open it in a browser.
- Render free tier sleeps after ~15min idle (cold-start delay on next visit) and has no persistent disk of its own (fine now — nothing writes to local disk anymore).

