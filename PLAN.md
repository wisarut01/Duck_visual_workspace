# PLAN.md — Coboard v1.1 batch (images, PDF export, editing-UX, styling)

Supersedes the previous PLAN.md (connectors + text alignment — all shipped, see
`CLAUDE.md` progress log).

Six features, six branches, six handoffs. **One Sonnet agent per feature.**
Opus reviews each branch *before* merge and re-reviews `main` *after* merge.

---

## 0. Ground rules (every feature, no exceptions)

From `CLAUDE.md` "Feature workflow":

1. `git checkout main` (no remote configured — local `main` is the truth), then
   `git checkout -b <branch>` **before writing any code**.
2. **Tests first.** Write the new-feature tests, run `npm test`, confirm they fail
   *for the right reason* (module/export missing — not a typo, not a config error).
   Quote that failing output in your handoff report.
3. Then implement.
4. Final gate — run all four, all must be clean:
   - `npm test` (every pre-existing test included and green — no regressions)
   - `npx tsc --noEmit`
   - `npx eslint .`
   - `SUPABASE_URL=https://x.supabase.co SUPABASE_SERVICE_ROLE_KEY=x npm run build`
     (the dummy env vars are a pre-existing requirement, not your bug. The URL
     must be *syntactically* valid — `@supabase/supabase-js@2.110.8` validates it
     and rejects a bare `x` with `Invalid supabaseUrl: Must be a valid HTTP or
     HTTPS URL.` The `CLAUDE.md` progress log's older `SUPABASE_URL=x` form is
     stale; it fails on unmodified `main` too.)
5. Commit on the branch. **Do not merge.** Report back; Opus reviews, then merges.

Extra rules for this repo:

- `AGENTS.md`: this is Next.js 16 with breaking changes vs. training data. Read
  `node_modules/next/dist/docs/` before using any Next API you are not certain of.
- No `useEffect` + `setState` — eslint has `react-hooks/set-state-in-effect` on.
  For "client-only value that must not break SSR", follow the established
  `useSyncExternalStore` pattern (`src/lib/theme.ts`, `src/components/JoinCard.tsx`).
- New Yjs fields are **always optional** (`foo?: T`) with the default equal to
  today's rendering. Existing boards must look identical after your change — old
  boards live in Supabase `board_snapshots` as binary Yjs blobs and cannot be
  migrated.
- All mutations go through `updateFields(board.doc, container, id, {...})` so undo
  groups correctly (500 ms capture window).
- Pure logic (geometry, layout, color math, export bounds) goes in `src/lib/*.ts`
  so it is unit-testable without a DOM. React components get at most a light
  `@testing-library/react` smoke test. `src/lib/connector-path.ts` is the model.
- Style with existing CSS custom properties (`--panel`, `--panel-border`, `--ink`,
  `--accent`, `--accent-soft`, `--hair`, `--danger`). No hardcoded hex — the
  light/dark theme toggle depends on it.
- Touch targets: this app is used on phones. Any new interactive control is
  **≥36 px on screen** (F2 defines how "on screen" is enforced under zoom).

### Key files

| File | What lives there |
|---|---|
| `src/lib/board-doc.ts` | Yjs schema (`NoteData`/`ShapeData`/`TextData`/`FrameData`/`ArrowData`), `addX`, `updateFields`, `deleteObj` |
| `src/components/Canvas.tsx` | ~1960 lines, all rendering + interaction. `FontToolbar` (~152), `resolveBinding` (~213), `ArrowheadDefs` (~253), `ResizeHandles` (~351), `Canvas` (~425), keydown handler (~886), world render (~936), topbar (~1062), tool palette (~1134), `ConnectorToolbar` (~1214), `ArrowItem` (~1297), `NoteItem` (~1531), `ShapeItem` (~1594), `TextItem` (~1731), `FrameItem` (~1791) |
| `src/components/Canvas.module.css` | `.shape`, `.shapeBody`, `.anchor`, `.frame`, `.flabel`, `.del`, `.fontToolbar`, `.connectorToolbar`, `.resizeHandle`, `.toolbar` |
| `src/components/BoardShell.module.css` | topbar (`.topbar`, `.tbGroup`, `.shareBtn`) |
| `src/lib/palette.ts` | `NOTE_COLORS` — 6 `{bg, tag}` entries; `color` fields are **indices** into it |
| `server/y-server.mjs`, `server/supabase-schema.sql` | relay + Supabase persistence |

### Merge order (mandatory — these all touch `Canvas.tsx`)

**F2 → F5 → F3 → F6 → F4 → F1.**

F2 builds the screen-space toolbar primitive everything else reuses; F5 applies it
to frames; F3/F6/F4 add controls into that shared toolbar; F1 is the largest and
lands last, onto a settled file. Each agent branches from **`main` as it stands
after the previous merge**, not from an older commit.

---

## F2 — Toolbars stay a readable, fixed screen size at any zoom
`branch: feat/screen-space-toolbars` · first · foundation for F3/F4/F5/F6

**Problem (user):** clicking a shape or connector shows an edit toolbar so small
you have to zoom in to read it.

**Root cause:** `FontToolbar` and `ConnectorToolbar` are descendants of `.world`,
which carries `transform: translate(...) scale(view.s)`. At `view.s = 0.4`, a 24 px
button renders 9.6 px. The old PLAN.md claimed `FontToolbar` was already
screen-space; it never was.

### Approach — counter-scale, do **not** portal

Both toolbars already receive `view` (`ShapeItem`/`NoteItem`/`TextItem`/`ArrowItem`
all take `view: ViewState`). Apply `transform: scale(1 / view.s)` with a
`transform-origin` at the toolbar's anchor point. Net on-screen scale is
`view.s × (1/view.s) = 1`. The toolbar stays a child of the element it belongs to —
no second positioning system, no portal, no scroll/resize listener to keep in sync.

- [ ] New pure helper `src/lib/screen-space.ts`:
      - `counterScale(zoom, origin)` returning `{ transform, transformOrigin }`
        (`scale(1/zoom)`), origin selectable — toolbars sit *above* their element so
        bottom-center is the default; F5 needs bottom-left.
      - Guard: `zoom` of 0 / NaN / negative must not produce `Infinity` — clamp the
        divisor to a floor (e.g. 0.05).
      - Unit tests: identity at zoom 1, `scale(2)` at 0.5, `scale(0.5)` at 2, guard at 0.
- [ ] `FontToolbar` takes `zoom: number`, applies the counter-scale.
- [ ] `ConnectorToolbar` same. It lives inside a `<foreignObject>`; the counter-scale
      goes on the inner `<div>`, and the `foreignObject`'s `width`/`height` must be
      grown (or the existing `overflow: visible` relied on) so a zoomed-out toolbar
      isn't clipped by its own box. **Verify at zoom 0.25** — that is the failure
      mode to watch.
- [ ] The vertical offsets (`y - 32`, `y - 76`) are world units, so the gap between
      element and toolbar also shrinks with zoom. Convert to `PX / zoom` so the
      on-screen gap is constant.
- [ ] Bump *base* sizes ~1.35× — they are cramped even at zoom 1:
      `.fontToolbar button` and `.connectorToolbar button` to **min 36×32 px**,
      font 12 → 13 px, padding/gap up proportionally; `.connectorToolbar select`
      min-height 32 px, font 13 px. `ConnectorToolbar`'s hardcoded `width = 372`
      must be re-measured after this.
- [ ] `.anchor` (hover connector dots, 14 px) and `.resizeHandle` (10 px) also shrink
      with zoom and are already borderline on touch. Counter-scale both.
      `ResizeHandles` already receives `view`. **Careful:** `.a-*` and `.rh-*` use
      `transform: translateX(-50%)` etc. for centering — you must **compose** the
      counter-scale with the existing translate, not replace it, and the
      `.shape.diamond .a-*` overrides (`transform: none`) must keep working.

### Tests
- `src/lib/screen-space.test.ts` — the pure helper.
- `src/components/toolbar-scale.test.tsx` — `FontToolbar` at `zoom = 0.5` has an
  inline `transform` containing `scale(2)`; at `zoom = 2`, `scale(0.5)`.
  `FontToolbar` is module-private today — prefer exporting a small
  `toolbarStyle(zoom)` from `screen-space.ts` and testing that (smaller API change)
  over exporting the component.
- Regression: full existing suite green.

### Manual check before handing back
`next dev` + relay, open a board, place a shape and a connector, zoom to 0.25 and to
3.0. Toolbar text legible and buttons the same physical size at both; not clipped;
resize handles and anchor dots still hit-testable at 0.25.

---

## F5 — Frame label + frame controls legible and touch-sized
`branch: feat/frame-controls` · after F2 · uses F2's `screen-space.ts`

**Problem (user):** the frame's name tab / edit tab is too small to see.

- [ ] `.flabel` (`Canvas.module.css` ~line 55) counter-scales with `view.s`, same
      primitive as F2. `transform-origin` **bottom-left** — the tab sits above the
      frame's top-left corner and that corner must stay pinned. `FrameItem` already
      receives `view`.
- [ ] Base size up: font 12 → 14 px, padding `5px 8px` → `7px 12px`, min-height 30 px.
- [ ] `.del` (the frame's `×`, today 20×20 at `opacity: 0.55`) → 30×30, opacity 0.8,
      counter-scaled, positioned so it does not overlap a long label. Keep the
      `--danger` hover.
- [ ] That `×` is currently the **only** on-canvas delete affordance anywhere, and
      only for frames. F4 generalises it. Here, just shape it so F4 can lift it (a
      small `<DeleteButton zoom onDelete>` in `Canvas.tsx` is fine). Don't
      over-abstract — F4 owns the generalisation.
- [ ] Frames have **no** selection toolbar today (only resize handles). Add nothing
      beyond label + delete sizing; frame styling is out of scope for this batch.

### Tests
- Extend `src/lib/screen-space.test.ts` for the bottom-left origin variant.
- `src/components/frame-label.test.tsx` — render `FrameItem` (export it) with
  `view.s = 0.5`, assert the label's `transform` counter-scales. If mounting
  `FrameItem` needs too much setup, `createBoardDoc()` from `board-doc.ts` works
  standalone and needs no network.
- Regression: full suite green.

---

## F3 — Shape color + shape border thickness, editable after creation
`branch: feat/shape-styling` · after F5

**Problem (user):** once a shape exists you cannot change its color, and there is
no thickness control like the connector has.

### Schema (`src/lib/board-doc.ts`)
- [ ] `ShapeData.strokeWidth?: number` — border width in world units. Undefined
      renders as today's `2.5` (`.shape { border: 2.5px solid }`).
- [ ] `ShapeData.color` already exists (index into `NOTE_COLORS`) but is set only at
      creation. No schema change — UI only.
- [ ] `ShapeData.filled?: boolean`, default `true` = today's `${c.bg}2e` background;
      `false` = transparent. Include it — an outline-only shape is the most-missed
      option in a diagramming tool.
- [ ] Do **not** add free-form hex colors. The 6-entry `NOTE_COLORS` palette is the
      design system (`DESIGN.md` §1.3) and is what keeps light/dark legible.

### UI
- [ ] Extend `FontToolbar` into the shared **element toolbar** (rename to
      `ElementToolbar`; it is already shared by note/shape/text). New groups, shown
      conditionally per kind:
      - **color** — 6 swatch buttons from `NOTE_COLORS`, active one ringed with
        `--accent`. Shown for note **and** shape (notes can't be recolored today
        either — same one-line fix, include it).
      - **thickness** — 4 presets; reuse the existing `ARROW_STROKE_PRESETS`
        (`[1.5, 2.5, 4, 6.5]`), don't duplicate the constant. Shape only.
      - **fill toggle** — filled / outline. Shape only.
- [ ] `ShapeItem` renders `borderWidth: data.strokeWidth ?? 2.5` and
      `background: data.filled === false ? "transparent" : \`${c.bg}2e\``. Keep the
      `2e` alpha-suffix convention exactly.
- [ ] The toolbar is getting wide. Wrap to a second row rather than growing past
      ~420 screen px or the phone case breaks — `flex-wrap: wrap` + `max-width` on
      `.fontToolbar` is enough.
- [ ] Auto-grow interaction: `ShapeItem`'s `ResizeObserver` compares
      `scrollHeight + SHAPE_PAD_Y` against `h`. A thicker border changes the content
      box — confirm a 6.5 px border doesn't trigger a grow loop; if it does, fold the
      border width into the `SHAPE_PAD_Y` calculation.

### Tests
- `src/lib/board-doc.test.ts` (new) — `addShape` then
  `updateFields(..., {color, strokeWidth, filled})` round-trips through the Y.Doc;
  a shape saved **without** the new fields reads back with the old defaults. This is
  the "existing boards don't break" test.
- `src/components/element-toolbar.test.tsx` — clicking swatch #3 calls `onChange`
  with `{ color: 3 }`; clicking a thickness preset calls with that `strokeWidth`.
- Regression: full suite green, `connector-path`/`palette`/`theme` tests untouched.

---

## F6 — Text color, bold, italic, underline
`branch: feat/text-styling` · after F3 · builds on F3's `ElementToolbar`

**Problem (user):** text can't change color and has no bold/italic/underline.

### Constraint — read before designing
`body`/`label` are **plain strings, not `Y.Text`** (see the comment at the top of
`board-doc.ts`). So these are **whole-element** properties, not per-character rich
text. Bolding only three selected words is **out of scope** — it needs the `Y.Text`
migration listed as outstanding in `CLAUDE.md`. Do not attempt it. Add a one-line
comment next to the new fields recording this.

Also: the bodies are `contentEditable`. Native <kbd>Ctrl</kbd>+<kbd>B</kbd> inserts
`<b>` tags that the `onBlur` handler then discards via `textContent` — silently
losing the edit. **Suppress those keys** (`onKeyDown` + `preventDefault()` for
Ctrl/Cmd+B/I/U) and route them to the new element-level fields. This is a real
existing papercut; fixing it is part of this feature.

### Schema — on `NoteData`, `ShapeData`, `TextData` (all three)
- [ ] `bold?: boolean`, `italic?: boolean`, `underline?: boolean` — undefined =
      false = today.
- [ ] `textColor?: number` — index into a new `TEXT_COLORS` in `src/lib/palette.ts`.
      Undefined = today's `var(--ink)`, which is theme-aware. **Keep undefined
      meaning "auto/theme ink"** — do not resolve it to a hex at write time, or dark
      mode breaks. `TEXT_COLORS` ≈ 6 entries legible on both theme panel backgrounds
      *and* on the 6 `NOTE_COLORS` sticky backgrounds.
- [ ] Add `contrastRatio(hexA, hexB)` to `palette.ts` (WCAG relative luminance) —
      this is the testable pure core. Assert every `TEXT_COLORS` entry is ≥ 4.5:1
      against both theme backgrounds.
- [ ] `FrameData.label` styling: **skip**, out of scope.

### UI
- [ ] `ElementToolbar` gains a **B / I / U** toggle group (`ftActive` when on) and a
      text-color swatch row. Shown for note/shape/text.
- [ ] Render as inline styles on each body: `fontWeight: bold ? 700 : 500` (the
      existing base weight is 500, not 400 — see `.shapeBody`), `fontStyle`,
      `textDecoration`, `color`.
- [ ] Ctrl/Cmd+B/I/U while a body is focused toggles the element field, with
      `preventDefault()`. The global keydown handler (`Canvas.tsx:886`) ignores
      modifier combos except undo/redo — check you don't collide.

### Tests
- `src/lib/palette.test.ts` — extend: `contrastRatio` known values (white/black =
  21:1, same color = 1:1), `TEXT_COLORS` contrast assertions.
- `src/lib/board-doc.test.ts` — the three booleans + `textColor` round-trip and
  default to undefined.
- `src/components/text-styling.test.tsx` — the B toggle calls `onChange({bold: true})`;
  a body rendered with `bold: true` has `font-weight: 700`.
- Regression: full suite green.

---

## F4 — On-canvas delete button (mobile has no Backspace key)
`branch: feat/delete-button` · after F6

**Problem (user):** deleting requires <kbd>Backspace</kbd>; on a phone there is no
practical way to delete anything except a frame.

- [ ] Add a delete button to the shared `ElementToolbar` (rightmost, after a
      separator, `--danger` trash glyph) so **every** selected note/shape/text gets one.
- [ ] Add the same to `ConnectorToolbar` for arrows.
- [ ] Frames: keep F5's enlarged `×`; unify the glyph if it reads better, but be
      consistent within the board.
- [ ] Wire to the **same** code path as the keyboard. `Canvas.tsx:886` does
      `deleteObj(board.doc, containers[sel.kind], sel.id)` then clears selection —
      extract that into a `deleteSelection(sel)` callback on `Canvas` and pass it
      down. Do **not** duplicate delete logic per component, or undo grouping and
      selection-clearing drift apart.
- [ ] After deleting, `setSelection(null)`. Verify Ctrl+Z restores the object (the
      `UndoManager` tracks all five containers).
- [ ] Misfire guard: the button must `e.stopPropagation()` on `pointerdown` like
      every other toolbar control. A single tap deleting is acceptable (undo exists);
      a tap that lands on delete when the user meant the element underneath is not —
      keep ≥8 px between it and the neighbouring group.
- [ ] `Canvas.tsx:886` early-returns when the event target is `contentEditable` (so
      Backspace edits text instead of deleting the object). Read that block before
      touching it and preserve the behaviour.

### Tests
- `src/components/delete-button.test.tsx` — clicking the toolbar's delete calls the
  passed `onDelete` exactly once.
- Doc-level: `createBoardDoc()`, `addShape`, `deleteObj`, assert `shapes.size === 0`,
  then `undoManager.undo()`, assert it is back. Locks the undo-after-delete contract
  the button depends on.
- Regression: full suite green.

---

## F1 — Image insert + PDF export
`branch: feat/images-and-pdf-export` · last, largest · two sub-parts

**Problem (user):** (a) put images on the board via a new toolbar button;
(b) export a chosen part of the board as PDF.

Two commits on one branch. If time forces a cut, land F1a alone and report F1b as
not-done — do not half-land either.

### F1a — Images

**Storage decision:** the Yjs doc is snapshotted to Supabase as one binary blob and
broadcast to every client on load. Base64 image data in the doc would bloat that
unboundedly. So: **upload to Supabase Storage, store only the URL in the Y.Doc.**

- [ ] Supabase Storage bucket `board-images`, public read. Put the bucket + policy
      SQL in `server/supabase-schema.sql` next to the existing tables so it is
      reproducible. **Flag in your handoff that the operator must create the
      bucket** — app code does not create it.
- [ ] `POST /api/uploads` (`src/app/api/uploads/route.ts`) — multipart body; requires
      a session (reuse `src/lib/auth.ts`'s lookup, same as `/api/boards`); MIME
      allowlist `image/png|jpeg|gif|webp` — **exclude SVG**: an uploaded SVG served
      from a public URL is a stored-XSS vector if ever rendered inline; raster only.
      Max 5 MB. Writes under a random key, returns `{ url, width, height }`.
      The app allows **anonymous board joining**, so state the decision explicitly:
      uploads require an account (keeps the bucket from being an open file host) and
      the button shows a "sign in to add images" hint for guests.
- [ ] `ImageData { x, y, w, h, url, naturalW, naturalH }` in `board-doc.ts`; an
      `images: Y.Map<Y.Map<unknown>>` container added to `BoardDoc`, `createBoardDoc`,
      **and the `UndoManager`'s tracked list**. Adding a container is
      backward-compatible (an old snapshot just has an empty `images` map) — verify
      against a real pre-existing board.
- [ ] New toolbar button (`ToolButton tool="image"`; add `"image"` to the `Tool`
      union and `ObjKind`; `i` is a free shortcut letter). Click opens a file picker;
      on select, upload, then place at viewport centre scaled to ~400 world units on
      the long edge.
- [ ] `ImageItem`: draggable (`useSimpleDrag` does all of it), selectable,
      `ResizeHandles` with **aspect-ratio-locked** resize (`naturalW/naturalH`) — a
      squashed photo reads as broken in a way a squashed rect does not. Delete via
      F4's button.
- [ ] Nice-to-have if cheap: clipboard paste and drag-and-drop onto the canvas via
      the same upload path. Skip if it costs real time.

### F1b — PDF export of a selected region

**Rendering decision:** do **not** use `html2canvas`/DOM capture — it is fragile with
CSS custom properties, `foreignObject`, and rotated diamonds, all of which this board
uses. **Re-draw the board onto an offscreen `<canvas>` from the Yjs model**, which we
fully control, then hand that canvas to `jsPDF`.

- [ ] One new dependency: `jspdf`. Nothing else.
- [ ] Pure module `src/lib/export-bounds.ts` — the testable core:
      - `objectBounds(kind, data): Rect` per kind.
      - `unionBounds(rects): Rect | null`.
      - `objectsInRegion(...)` — include an object if its bounds **intersect** the
        region (not "fully contained" — a half-covered sticky should export). Arrows
        use resolved endpoints; take resolved coords as input or reuse
        `resolveBinding` semantics, and comment that a bound arrow's raw `x1..y2` can
        be stale (documented trade-off in `CLAUDE.md`).
      - `fitToPage(contentRect, pageW, pageH, margin) -> {scale, offsetX, offsetY}` —
        preserves aspect ratio.
      These four carry the feature's logic and must be unit-tested exhaustively. The
      canvas drawing itself is untestable in jsdom — keep it thin.
- [ ] `src/lib/export-pdf.ts` — draws the resolved object list to a canvas at 2×
      device scale (notes; shapes incl. ellipse/diamond and F3's fill/stroke width;
      texts with F6's styling; frames; connectors incl. routing/arrowheads; images),
      then `jsPDF` → `save()`. **Reuse `connector-path.ts` for elbow paths — do not
      reimplement routing.** Images need `crossOrigin = "anonymous"` before drawing or
      the canvas is tainted and `toDataURL` throws; Supabase public URLs send
      permissive CORS — verify.
- [ ] UI: **Export** button in the topbar next to Share, opening a small menu:
      - *Whole board* — union of all object bounds + margin.
      - *This frame* — enabled when a frame is selected; region = frame bounds.
      - *Select area…* — marquee mode (dashed rect drag, same visual language as the
        existing `drawPreview`), release runs the export.
- [ ] Text in the PDF is rasterised, not selectable — an accepted trade-off of the
      canvas approach. Say so in the handoff; don't ship it as if it were vector.
- [ ] Multi-page: **out of scope.** One page, scaled to fit.

### Tests
- `src/lib/export-bounds.test.ts` — bounds per kind; union; intersection
  inclusion/exclusion at the edges (touching, 1 px overlap, fully outside);
  `fitToPage` aspect preservation for wide/tall/square and the degenerate zero-area
  region.
- `src/lib/board-doc.test.ts` — `images` container round-trip; a doc without `images`
  loads with `images.size === 0`.
- API route test if practical; otherwise a documented manual curl check of
  `/api/uploads` (401 unauthenticated, 415 wrong MIME, 413 oversize, 200 happy path)
  in the handoff report.
- Regression: full suite green.

---

## Handoff report format (every agent, back to Opus)

1. Branch name + commit SHAs.
2. The tests-first failure output (short quote proving red-before-green).
3. Final gate output: `npm test` counts, and that tsc/eslint/build were clean.
4. Files touched, one line each.
5. Anything you skipped, and why.
6. Anything you found in the plan that was wrong (the previous batch found two such
   errors — say so plainly, don't silently work around it).

---

## Out of scope for this batch (do not scope-creep)

- `Y.Text` migration for `body`/`label` (per-character rich text, real concurrent
  text merge). Still the biggest outstanding item — see `CLAUDE.md`.
- Multi-select, pen tool, comments, dot-voting, workshop timer, emoji reactions,
  minimap, presentation mode, pinch-zoom, duplicate/z-order (Epic 8).
- Vector / selectable-text PDF export; multi-page PDF.
- Per-shape-kind true-outline connector attach (bbox midpoints remain).
