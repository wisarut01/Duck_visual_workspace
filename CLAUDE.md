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

Not done — remaining for full product (see `../SUMMARY.md` §4 for original list): — no accounts, no server-side identity, dashboard/profile don't sync across devices/browsers.
- Epic 8: general polish — pen tool, comment threads, dot-voting, workshop timer, emoji reactions, multi-select, minimap, presentation mode, pinch-zoom, duplicate/z-order.
- `body`/`label` fields still plain strings not `Y.Text` — concurrent same-object typing is last-writer-wins, not merged.
- Public/internet deploy — relay only tested on LAN, nothing hosted publicly.
- Known cosmetic gap: diamond shape's 4 hover-anchor dots inherit the shape's 45° CSS rotation, so they sit slightly off true N/E/S/W points. Accepted trade-off, not fixed.

