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

export interface NoteData {
  x: number;
  y: number;
  color: number;
  body: string;
  author: string;
  votes: number;
  fontSize?: number;
  fontFamily?: FontFamily;
}
export interface ShapeData {
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  body: string;
  fontSize?: number;
  fontFamily?: FontFamily;
}
export interface TextData {
  x: number;
  y: number;
  body: string;
  fontSize?: number;
  fontFamily?: FontFamily;
}
export interface FrameData {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
export interface ArrowData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  curve?: number;
}

export interface BoardDoc {
  doc: Y.Doc;
  notes: Y.Map<Y.Map<unknown>>;
  shapes: Y.Map<Y.Map<unknown>>;
  texts: Y.Map<Y.Map<unknown>>;
  frames: Y.Map<Y.Map<unknown>>;
  arrows: Y.Map<Y.Map<unknown>>;
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
  // Board-level metadata (currently just the room's display name). Kept out
  // of the undoManager's tracked type list on purpose — renaming the board
  // shouldn't be grouped with, or undoable via the same Ctrl+Z stack as,
  // object edits.
  const meta = doc.getMap<unknown>("meta");
  // Consecutive transactions within 500ms merge into one undo step —
  // this is what makes a drag (many small commits) undo as a single move.
  const undoManager = new Y.UndoManager([notes, shapes, texts, frames, arrows], {
    captureTimeout: 500,
  });
  return { doc, notes, shapes, texts, frames, arrows, meta, undoManager };
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

export function addArrow(b: BoardDoc, x1: number, y1: number, x2: number, y2: number): string {
  const id = newId("arrow");
  put(b.doc, b.arrows, id, { x1, y1, x2, y2 } satisfies ArrowData);
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
