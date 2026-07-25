# PLAN.md — Coboard next batch (connectors + text alignment)

Scope: Miro-parity work on connectors, quick-create from shape anchors, and
text alignment. Everything below is new work on top of the shipped app (see
`CLAUDE.md` progress log for what's already done).

Key files:
- `src/lib/board-doc.ts` — Yjs data shapes (`ArrowData`, `ShapeData`, `NoteData`, `TextData`), `addArrow`, `updateFields`
- `src/components/Canvas.tsx` — all rendering + interaction (~1500 lines): `ArrowObj` (~line 914), `ShapeObj` (~line 1159), viewport pointer handlers (~line 445), `nearestBoundaryPoint` (~line 167), `FontToolbar` (~line 130)
- `src/components/Canvas.module.css` — `.arrow`, `.anchor`, `.a-n/e/s/w`, `.shapeBody`, `.arrowThicknessBar`

---

## Epic A — Connector styling

### A1. Line thickness (mostly done — verify + fold into new toolbar)
`ArrowData.strokeWidth` + a 4-preset picker already exist (`ARROW_STROKE_PRESETS`,
rendered above the selected arrow's midpoint). Work left:
- [x] Move the picker into a single unified **connector toolbar** (see A4) instead of the bare SVG strip
- [x] Keep `strokeWidth` optional with the current default so existing boards don't change

### A2. Arrowhead style
- [x] Add to `ArrowData`: `headStart?: ArrowHead`, `headEnd?: ArrowHead` where
      `type ArrowHead = "none" | "arrow" | "triangle" | "circle" | "diamond"`.
      Default: `headStart: "none"`, `headEnd: "arrow"` (matches today's look).
- [x] Render with SVG `<marker>` defs in the board's `<svg>` layer. One marker per
      (style × strokeWidth) is wasteful — instead define markers with
      `markerUnits="strokeWidth"` and `orient="auto-start-reverse"` so a single def
      per style scales with the line and flips correctly for the start head.
- [x] Marker `<defs>` need unique ids per board svg; use a module-level constant
      prefix, they're global to the document.
- [x] Toolbar control: two small dropdowns/segmented pickers (start head, end head).

### A3. Line routing: straight / curved / elbow
Today `ArrowData.curve` (perpendicular offset) drives a single quadratic `Q` path.
Replace with an explicit mode:
- [x] Add `ArrowData.routing?: "straight" | "curved" | "elbow"` (default `"curved"`
      when `curve` is non-zero, else `"straight"` — pick the default so existing
      saved arrows keep their current appearance).
- [x] `straight` — `M x1 y1 L x2 y2`. Curve handle hidden.
- [x] `curved` — existing `Q` path with the draggable curve handle. Unchanged.
- [x] `elbow` — **the main new work.** Orthogonal (right-angle) polyline like Miro:
      - Route depends on which sides the endpoints attach to (see Epic B binding).
      - Unbound endpoints: pick H-then-V or V-then-H by comparing `|dx|` vs `|dy|`,
        with the elbow at the midpoint (`M x1 y1 L mx y1 L mx y2 L x2 y2` style).
      - Bound endpoints: leave the shape perpendicular to its bound side, with a
        small stub (~20 world units) before the first turn so the line doesn't
        graze the shape's corner.
      - Round the corners with `stroke-linejoin="round"` plus a small arc, or
        emit `A` segments at each bend (radius ~8, clamped to half the shorter leg).
      - Path generation belongs in a pure helper (e.g. `elbowPath(a, b, sideA, sideB)`)
        in `Canvas.tsx` or a new `src/lib/connector-path.ts` — keep it testable and
        out of the component body.
- [x] Hit-testing: the elbow path is still one `<path>`, so existing pointer
      handlers keep working. Verify the "move whole line" drag still behaves.
- [x] Toolbar control: 3-way segmented picker with mini path icons.

### A4. Unified connector toolbar
- [x] Replace the current inline SVG thickness strip with one floating toolbar
      shown when an arrow is selected, holding: routing (3), thickness (4),
      start head, end head. Position it near the path midpoint, in screen space
      (like the existing font toolbar) so it doesn't scale with zoom.

---

## Epic B — Connectors that stick to shapes (Miro-style binding)

Today arrow endpoints are frozen world coordinates: snapping only happens once,
at drop time, and moving the shape afterwards leaves the arrow behind.

- [x] Add to `ArrowData`: `from?: Binding`, `to?: Binding` where
      `interface Binding { id: string; side: "n" | "e" | "s" | "w" | "auto" }`
      (`id` is a shape id; `"auto"` = pick the nearest side dynamically).
- [x] At render time in `ArrowObj`, resolve a bound endpoint from the live shape
      data instead of `x1/y1`/`x2/y2`. Keep writing the resolved coordinates back
      into `x1..y2` on shape move so unbinding/old clients still see a sane line
      (or treat `x1..y2` as a pure fallback — pick one and document it).
- [x] `"auto"` side resolution: choose the shape side facing the other endpoint,
      then place the endpoint on that side's midpoint (or use `nearestBoundaryPoint`
      for a shape-hugging attach point). Ellipse/diamond should attach on their true
      outline, not the bounding box, if cheap to do — otherwise bbox is acceptable.
- [x] **Attract while dragging**, not just on drop: while dragging an endpoint (or
      an anchor-drag from a shape), highlight the shape under the cursor within the
      existing `ARROW_SNAP_PAD_PX` tolerance and show its 4 anchor dots; release
      binds. Reuse/extend the `pad` hit-test already in `onViewportPointerUp`.
- [x] Dragging a bound endpoint away from any shape clears the binding.
- [x] Moving/resizing a bound shape must re-render its connectors live. Shapes are
      already reactive Yjs maps, so this mostly means `ArrowObj` reading shape data
      from the same subscribed collection the canvas already holds — avoid a second
      observer per arrow.
- [x] Deleting a shape should clear (not orphan) bindings on its connectors —
      decide: delete the connector too, or leave it with frozen coords. Frozen
      coords is the safer default.

---

## Epic C — Quick-create shape from a hover anchor

Miro: hover a shape, its side anchors appear; **click** (not drag) an anchor to
create a new connected shape in that direction.

- [x] Distinguish click vs drag on `.anchor`: a pointerdown+up under ~4px of
      movement = quick-create; anything more = today's connector drag
      (`beginAnchorDrag`). Same click-vs-drag split style as `useSimpleDrag`.
- [x] On quick-create: add a new shape of the **same kind, size, and color** as the
      source, offset in the anchor's direction by shape extent + a gap (~60 world
      units), then `addArrow` bound (Epic B) from source side → new shape's opposite
      side.
- [x] Collision: if the target spot overlaps an existing shape, step further out
      along the same axis until clear (cap the attempts, then just place it).
- [x] Select the new shape and focus its body for immediate typing (reuse the
      existing `justCreated` mechanism).
- [x] Visual: render the anchor as a `+` on hover so it reads as "create", and
      show a ghost preview of the new shape while hovering the anchor.
- [x] Anchors currently only exist on shapes (`ShapeObj`). Notes are out of scope
      for this epic unless trivial.

---

## Epic D — Text alignment

No alignment control exists at all today; note/shape/text bodies are fixed by CSS.

- [x] Add `textAlign?: "left" | "center" | "right"` to `NoteData`, `ShapeData`,
      `TextData` (default: keep whatever each type renders today so existing
      boards don't shift — check `.noteBody` / `.shapeBody` / text CSS first).
- [x] Apply as an inline `textAlign` style on the contentEditable body, alongside
      the existing `fontSize` / `fontFamily` inline styles.
- [x] Extend `FontToolbar` (`Canvas.tsx` ~line 130) with a 3-button align group,
      matching the existing `ftActive` button styling and separated by `ftSep`.
- [x] `FontToolbar`'s `onChange` already takes a partial-fields object — pass
      `{ textAlign }` through the same path; no new plumbing needed.
- [ ] Optional (only if cheap): vertical alignment for shapes (`alignItems` on
      `.shapeBody`'s flex container). Skip for notes/text. (Skipped — marked
      explicitly optional in the plan; horizontal alignment covers the ask.)

---

## Cross-cutting requirements

- [x] **Every new field is optional** with a default that preserves today's
      rendering — old boards live in Supabase `board_snapshots` as binary Yjs
      blobs and cannot be migrated.
- [x] All mutations go through `updateFields(board.doc, container, id, {...})`
      inside a Yjs transaction so undo/redo groups correctly (500ms capture window).
- [x] Verify with a second browser tab that changes sync (relay must be running).
- [x] Gate before calling done: `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- [x] Read `node_modules/next/dist/docs/` before touching anything Next-specific —
      per `AGENTS.md`, this Next version differs from training data.
- [x] Update the `CLAUDE.md` progress log when the batch lands.

## Suggested order

D (self-contained, quick win) → A1+A4 (toolbar shell) → A2 (heads) →
B (binding — unlocks good elbow routing) → A3 (elbow) → C (quick-create,
depends on B).

---

## Still out of scope (unchanged from before)

- Epic 8 general polish: pen tool, comment threads, dot-voting, workshop timer,
  emoji reactions, multi-select, minimap, presentation mode, pinch-zoom,
  duplicate/z-order.
- `body`/`label` as `Y.Text` (concurrent same-object typing is last-writer-wins).
- Diamond shape's 4 hover-anchor dots inherit the 45° CSS rotation — note that
  Epic C touches these; fixing the rotation is now cheap to fold in.
