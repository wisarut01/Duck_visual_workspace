@AGENTS.md

## Feature workflow

New feature: create new branch first, every time.
Before code: write test case first (for new feature).
Test suite must cover old feature + new feature both, confirm no break either side.
Test pass → merge to main branch.

## Progress log (update as work continues)

Done — light/dark theme toggle (this session):
- Added a test runner from scratch (repo had none): `vitest` + `jsdom` + `@testing-library/react` + `@testing-library/dom` as devDeps, `npm test` → `vitest run`, config in `vitest.config.ts` (kept separate from `next.config.ts`/the Next build graph on purpose — `next build` never reads it).
- Followed the mandated workflow: branch `feat/theme-toggle`, wrote all tests first (new-feature tests for `theme.ts`/`ThemeToggle` plus regression tests for the existing pure modules `connector-path.ts`, `room.ts`, `palette.ts`), confirmed the new-feature tests failed for the right reason (`theme.ts`/`ThemeToggle.tsx` didn't exist yet) while the regression tests passed against the untouched modules, then implemented. Final gate: 54/54 tests green, `tsc --noEmit` clean, `eslint .` clean, `next build` clean (with dummy `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, same pre-existing requirement as before).
- `src/lib/theme.ts` — pure: `Theme = "light"|"dark"|"system"`, `readStored`/`writeStored` (try/catch around localStorage, same defensive pattern as `lib/profile.ts`), `resolveTheme` (maps `"system"` via `matchMedia`), `applyTheme` (stamps resolved value onto `document.documentElement.dataset.theme`), `nextTheme` (light→dark→system→light).
- Plan correction: the plan's step 4 said to reuse JoinCard's `useSyncExternalStore` boolean-flag pattern for `ThemeToggle`'s SSR-safety, but a plain boolean flag only solves *interactivity-before-hydration* (JoinCard's actual bug). It doesn't solve the theme toggle's harder problem: the button's own displayed icon/label depends on the *value* of the stored theme, so a naive `useState(() => readStored())` initializer reads real `localStorage` on the client's first (pre-hydration) render while the server always saw `"system"` — a genuine hydration content mismatch, not just an early-click race. Fixed by extending `theme.ts` with a tiny external-store pub/sub (`subscribeTheme`/`setTheme`/`getThemeSnapshot`/`getServerThemeSnapshot`) and driving the displayed theme itself through a second `useSyncExternalStore` call (server snapshot always `"system"`, matching the no-flash script's default), in addition to the boolean mounted-flag for disabling the button pre-hydration. No `useEffect`+`setState` anywhere in the component.
- `src/app/layout.tsx` — added a blocking inline `<script>` in a new `<head>` that duplicates `readStored`/`resolveTheme`/`applyTheme`'s logic in plain JS (can't import the TS module into a raw pre-hydration script) to set `data-theme` before first paint, `suppressHydrationWarning` on `<html>` since the script mutates it outside React's control.
- `src/components/ThemeToggle.tsx` + `.module.css` — single icon button (☀/☾/◐) cycling the three states, styled with the existing `--panel`/`--panel-border`/`--panel-shadow`/`--ink`/`--hair` tokens (no new styling mechanism), `aria-label`/`title` both state the current theme and what a click switches to.
- Placed on the board topbar (`Canvas.tsx`, next to Share) and on `/`, `/login`, `/register`, `/dashboard`, `/profile`.
- Fixed the hardcoded `#c0392b` error-text color (unreadable against the dark panel background) to `var(--danger)` in `login/page.tsx`, `register/page.tsx`, `profile/page.tsx`.
- Audited `Canvas.module.css` and `BoardShell.module.css` for other hardcoded colors: everything left (`#33240a`/`rgba(51,36,10,…)` sticky-note text, the note's own box-shadow, `#fff` on accent-colored buttons/avatars/cursor labels, the presence-dot pulse `rgba` which is just `--ok` spelled out for the `@keyframes` block) is either explicitly theme-invariant per the plan or safe in both themes as-is — none converted.
- Merged to `main` locally; not pushed to any remote.

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

Done — connectors + text alignment batch (this session, see `PLAN.md`):
- Epic D (text alignment): `textAlign?: "left"|"center"|"right"` added to `NoteData`/`ShapeData`/`TextData`, applied as an inline style on each contentEditable body. Undefined preserves each type's pre-existing default (left for notes/text, center for shapes). `FontToolbar` grew a 3-button align group.
- Epic A1+A4 (unified connector toolbar): the old bare-SVG thickness strip is gone; a single `ConnectorToolbar` (routing / thickness / start+end arrowhead) now shows above a selected connector, rendered via `<foreignObject>` inside the SVG layer so it can hold real HTML controls (a `<select>` for each arrowhead).
- Epic A2 (arrowheads): `ArrowData.headStart`/`headEnd` (`"none"|"arrow"|"triangle"|"circle"|"diamond"`, default none/arrow — matches the old hardcoded look). One `<marker>` def per style (not per style×width): `markerUnits="strokeWidth"` + `orient="auto-start-reverse"` + `fill="context-stroke"` so a single global `<defs>` (rendered once, `ArrowheadDefs`) scales with the line and auto-matches the path's stroke color, including the `.selected` accent override, with zero extra plumbing.
- Epic A3 (routing): `ArrowData.routing?: "straight"|"curved"|"elbow"`, defaulting to `"curved"` when `curve !== 0` else `"straight"` (old boards render unchanged). Elbow (orthogonal, Miro-style) routing math lives in the new `src/lib/connector-path.ts` (`elbowPoints`/`roundedPath`/`elbowPath`/`elbowMidpoint`) — pure, no React — handling unbound (H-then-V or V-then-H by `|dx|` vs `|dy|`), single-side-bound (stub perpendicular to the bound side, then one bend), and both-sides-bound including the same-axis "Z" case, with rounded corners (radius clamped to half the shorter adjacent leg).
- Epic B (binding): `ArrowData.from?`/`to?: { id: string; side: "n"|"e"|"s"|"w"|"auto" }`. `ArrowItem` resolves bound endpoints live from the shapes collection each render (`resolveBinding`); `x1/y1/x2/y2` are kept only as a fallback for unbound endpoints / non-existent bound shapes — **not** written back on every shape move (documented trade-off: a bound arrow's raw fields can go stale while bound; `FrameItem`'s "which arrows are inside this frame" hit-test uses those raw fields, so a since-rebound arrow can misjudge frame membership — acceptable, matches the "frozen coords are the safer default" guidance in `PLAN.md`). Attract-while-dragging: dragging an endpoint (or an anchor-drag from a shape, or the plain arrow-tool draw) live-highlights the shape under the cursor (new `AttractAnchors` SVG overlay, since the pointer is captured elsewhere and shape `:hover` CSS won't reliably fire) and binds with `side: "auto"` on release; dragging a bound endpoint away clears its binding the instant real movement starts (not on click) so the line follows the cursor with no stale-position jump. Deleting a bound shape leaves its connectors with frozen coordinates (the resolution falls back to raw x/y when `shapesById.get(id)` misses) rather than deleting them.
- Epic C (quick-create): clicking (not dragging, <4px movement) a shape's hover anchor creates a same-kind/size/color sibling one gap (60 world units) past that side, stepping further out (capped at 20 attempts) if the spot overlaps something, then adds a bound connector and focuses the new shape's body. A dashed ghost preview shows on anchor hover (before click/drag) at the same offset. The anchor now also renders a `+` glyph. Click-vs-drag is decided in the viewport pointer handlers (`anchorPendingRef` promotes to `anchorDragRef` past the movement threshold), not in `ShapeItem`, so it reuses the existing attract/bind flow once promoted.
- Folded in the previously-deferred diamond hover-anchor cosmetic fix: the 4 anchor dots now sit at the unrotated box's corners (which is what actually rotates onto the diamond's true N/E/S/W tips) instead of the bbox edge midpoints — CSS-only, `.shape.diamond .a-*` overrides.
- Gate: `npx tsc --noEmit`, `npx eslint .`, `npm run build` (all clean — `next build` needs dummy `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in an env with no `.env`, pre-existing and unrelated to this batch); `next dev` + a loaded `/board/<room>` smoke test with the relay running.
- Skipped from `PLAN.md`: per-shape-kind true-outline attach for ellipse/diamond bindings (bbox side midpoints used throughout — explicitly called out as acceptable in the plan); writing resolved coordinates back into `x1..y2` on every shape move (chose the "pure fallback" alternative the plan offered instead, see Epic B note above); a genuinely screen-space (non-zoom-scaling) toolbar — see below.
- Plan corrections found while building: `PLAN.md` describes the existing `FontToolbar` as already screen-space positioned ("so it doesn't scale with zoom"); it isn't — it's a descendant of the zoom-`transform`ed `.world` div like everything else, so it visibly scales with zoom today. `ConnectorToolbar` follows that same established (scaling) convention rather than introducing a second, actually-fixed positioning mechanism, since the plan's own reference point turned out not to have the property it described.

Not done — remaining for full product (see `../SUMMARY.md` §4 for original list):
- Epic 8: general polish — pen tool, comment threads, dot-voting, workshop timer, emoji reactions, multi-select, minimap, presentation mode, pinch-zoom, duplicate/z-order.
- `body`/`label` fields still plain strings not `Y.Text` — concurrent same-object typing is last-writer-wins, not merged.
- No admin/human-readable view into `board_snapshots` content — it's a binary Yjs blob; the only way to inspect a room's content is to open it in a browser.
- Render free tier sleeps after ~15min idle (cold-start delay on next visit) and has no persistent disk of its own (fine now — nothing writes to local disk anymore).
- Connector/toolbar positioning (`FontToolbar` and the new `ConnectorToolbar`) scales with zoom instead of staying screen-space fixed size — see plan correction above; a real fix would need to portal these out of `.world` and track screen position separately.

