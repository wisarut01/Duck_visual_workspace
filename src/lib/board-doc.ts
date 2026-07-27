import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// Object shape per ../../FLOW.md §2 "Yjs data shape". `body`/`label` are
// still plain strings, not Y.Text, even now that epic 4 wires real
// multi-user sync — two people editing the *same* note/shape/frame body at
// once will last-writer-wins rather than merge character-by-character.
// Upgrading these fields to Y.Text is the natural next step; deferred so
// this pass could focus on transport + presence. See FLOW.md §8 epic 3 note.
export type ShapeKind = "rect" | "ellipse" | "diamond";

export type FontFamily = "ui" | "mono";

// Epic D: text alignment. Optional everywhere — an absent value falls back
// to whatever each element type already renders today (left for
// notes/text, center for shapes), so existing boards don't shift.
export type TextAlign = "left" | "center" | "right";

// Epic A2: arrowhead styles, one per end.
export type ArrowHead = "none" | "arrow" | "triangle" | "circle" | "diamond";

// Epic A3: connector routing mode.
export type Routing = "straight" | "curved" | "elbow";

// Epic B: which shape (and which side of it) a connector endpoint is bound
// to. `side: "auto"` re-picks the nearest-facing side every render as the
// bound shape (or the other endpoint) moves; a concrete side sticks to that
// side regardless of relative position (set when the user drags out from a
// specific anchor dot).
export type Side = "n" | "e" | "s" | "w";
export interface Binding {
  id: string;
  side: Side | "auto";
}

// F6 (text styling): bold/italic/underline/textColor are whole-element
// properties, not per-character rich text — `body`/`label` are still plain
// strings, not Y.Text (see the module comment above), so there is no way to
// style a sub-range of one. Undefined always means false / theme-default,
// matching every element's rendering before this field existed.
export interface TextStyleFields {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  // Index into palette.ts's TEXT_COLORS. Undefined means "auto" — renders
  // as the theme-aware `var(--ink)` — and must stay that way rather than
  // being resolved to a concrete hex at write time, or dark mode breaks.
  textColor?: number;
}

export interface NoteData extends TextStyleFields {
  x: number;
  y: number;
  color: number;
  body: string;
  author: string;
  votes: number;
  fontSize?: number;
  fontFamily?: FontFamily;
  textAlign?: TextAlign;
}
export interface ShapeData extends TextStyleFields {
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  body: string;
  fontSize?: number;
  fontFamily?: FontFamily;
  textAlign?: TextAlign;
  // F3 (shape styling): border width in world units. Undefined renders as
  // today's hardcoded `.shape { border: 2.5px solid }`.
  strokeWidth?: number;
  // F3: undefined/true = today's `${c.bg}2e` tinted background; false = a
  // transparent, outline-only shape.
  filled?: boolean;
}
export interface TextData extends TextStyleFields {
  x: number;
  y: number;
  body: string;
  fontSize?: number;
  fontFamily?: FontFamily;
  textAlign?: TextAlign;
}
export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
// F1a: an uploaded image placed on the board. Only the Supabase Storage
// public URL is stored in the Y.Doc — never base64 — since the whole doc is
// snapshotted to Supabase and broadcast to every client on load; embedding
// image bytes there would bloat that unboundedly. `naturalW`/`naturalH` (the
// original pixel dimensions) drive aspect-ratio-locked resizing; `w`/`h` are
// the on-board display size, independent of the natural size.
export interface ImageData {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
  naturalW: number;
  naturalH: number;
}
export interface ArrowData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  curve?: number;
  strokeWidth?: number;
  // Epic A2 — default (undefined) renders as the original look: no
  // arrowhead at the start, a plain arrow at the end.
  headStart?: ArrowHead;
  headEnd?: ArrowHead;
  // Epic A3 — undefined defaults to "curved" when `curve` is non-zero
  // (preserves existing saved arrows), else "straight".
  routing?: Routing;
  // Epic B — undefined means "frozen world coords", i.e. today's behavior.
  // x1/y1/x2/y2 are kept up to date as a fallback/last-known position for
  // unbinding and for clients that don't understand bindings; the live
  // render always prefers the bound shape's current position when present.
  from?: Binding;
  to?: Binding;
}

export interface BoardDoc {
  doc: Y.Doc;
  notes: Y.Map<Y.Map<unknown>>;
  shapes: Y.Map<Y.Map<unknown>>;
  texts: Y.Map<Y.Map<unknown>>;
  frames: Y.Map<Y.Map<unknown>>;
  arrows: Y.Map<Y.Map<unknown>>;
  images: Y.Map<Y.Map<unknown>>;
  meta: Y.Map<unknown>;
  undoManager: Y.UndoManager;
}

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

export function createBoardDoc(): BoardDoc {
  const doc = new Y.Doc();
  const notes = doc.getMap<Y.Map<unknown>>("notes");
  const shapes = doc.getMap<Y.Map<unknown>>("shapes");
  const texts = doc.getMap<Y.Map<unknown>>("texts");
  const frames = doc.getMap<Y.Map<unknown>>("frames");
  const arrows = doc.getMap<Y.Map<unknown>>("arrows");
  // F1a: images. Adding a new top-level container is backward-compatible —
  // an old snapshot that never wrote to "images" just yields an empty map
  // when read back (Y.Doc.getMap creates it on first access either way).
  const images = doc.getMap<Y.Map<unknown>>("images");
  // Board-level metadata (currently just the room's display name). Kept out
  // of the undoManager's tracked type list on purpose — renaming the board
  // shouldn't be grouped with, or undoable via the same Ctrl+Z stack as,
  // object edits.
  const meta = doc.getMap<unknown>("meta");
  // Consecutive transactions within 500ms merge into one undo step —
  // this is what makes a drag (many small commits) undo as a single move.
  const undoManager = new Y.UndoManager([notes, shapes, texts, frames, arrows, images], {
    captureTimeout: 500,
  });
  return { doc, notes, shapes, texts, frames, arrows, images, meta, undoManager };
}

export function getBoardName(b: BoardDoc): string {
  return (b.meta.get("name") as string | undefined) ?? "";
}

export function setBoardName(b: BoardDoc, name: string) {
  b.doc.transact(() => b.meta.set("name", name));
}

/** Subscribes to board name changes (local or remote); returns an unsubscribe fn. */
export function onBoardNameChange(b: BoardDoc, cb: (name: string) => void): () => void {
  const handler = () => cb(getBoardName(b));
  b.meta.observe(handler);
  return () => b.meta.unobserve(handler);
}

function put<T extends Record<string, unknown>>(
  doc: Y.Doc,
  container: Y.Map<Y.Map<unknown>>,
  id: string,
  fields: T,
) {
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(fields)) m.set(k, v);
    container.set(id, m);
  });
}

export function addNote(b: BoardDoc, x: number, y: number, color: number, author: string): string {
  const id = newId("note");
  put(b.doc, b.notes, id, { x, y, color, body: "", author, votes: 0 } satisfies NoteData);
  return id;
}

export function addShape(
  b: BoardDoc,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): string {
  const id = newId("shape");
  put(b.doc, b.shapes, id, { kind, x, y, w, h, color, body: "" } satisfies ShapeData);
  return id;
}

export function addText(b: BoardDoc, x: number, y: number): string {
  const id = newId("text");
  put(b.doc, b.texts, id, { x, y, body: "" } satisfies TextData);
  return id;
}

export function addFrame(b: BoardDoc, x: number, y: number, w: number, h: number, label: string): string {
  const id = newId("frame");
  put(b.doc, b.frames, id, { x, y, w, h, label } satisfies FrameData);
  return id;
}

export function addImage(
  b: BoardDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  url: string,
  naturalW: number,
  naturalH: number,
): string {
  const id = newId("image");
  put(b.doc, b.images, id, { x, y, w, h, url, naturalW, naturalH } satisfies ImageData);
  return id;
}

export function addArrow(
  b: BoardDoc,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra?: Partial<ArrowData>,
): string {
  const id = newId("arrow");
  put(b.doc, b.arrows, id, { x1, y1, x2, y2, ...extra } satisfies ArrowData);
  return id;
}

export function updateFields(
  doc: Y.Doc,
  container: Y.Map<Y.Map<unknown>>,
  id: string,
  fields: Record<string, unknown>,
) {
  const m = container.get(id);
  if (!m) return;
  doc.transact(() => {
    for (const [k, v] of Object.entries(fields)) m.set(k, v);
  });
}

export function deleteObj(doc: Y.Doc, container: Y.Map<Y.Map<unknown>>, id: string) {
  doc.transact(() => container.delete(id));
}

// ================= realtime transport (epic 4) =================
// Presence per FLOW.md §2 — ephemeral, carried over Yjs awareness, never
// persisted. `selection`/`following` aren't wired yet (deferred, see
// FLOW.md epic 4 note); this pass covers cursor + name/color + tool.
export interface Presence {
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  tool: string;
}

const DEFAULT_WS_URL = "ws://localhost:1234";

/**
 * Connects `board.doc` to the self-hosted relay (server/y-server.mjs) as
 * room `roomId`, and seeds the local awareness (presence) state. Returns the
 * provider so the caller can listen for status/sync events and read remote
 * awareness states — and must call `provider.destroy()` on unmount.
 */
export function connectRealtime(board: BoardDoc, roomId: string, me: Presence): WebsocketProvider {
  const serverUrl = process.env.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL;
  const provider = new WebsocketProvider(serverUrl, roomId, board.doc);
  provider.awareness.setLocalState(me);
  return provider;
}
