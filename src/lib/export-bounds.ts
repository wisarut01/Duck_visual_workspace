// F1b: pure geometry core for PDF export. Kept free of React/canvas/jsPDF so
// it's fully unit-testable — the canvas-drawing half (export-pdf.ts) is
// comparatively thin and untestable in jsdom (no real 2D context), so all
// the actual logic — what counts as "in the exported region", how a region
// maps onto a page — lives here instead, same split as connector-path.ts.
import type { NoteData, ShapeData, TextData, FrameData, ArrowData, ImageData } from "./board-doc";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ExportKind = "note" | "shape" | "text" | "frame" | "arrow" | "image";

export interface ExportObject {
  kind: ExportKind;
  id: string;
  bounds: Rect;
}

// Matches the sticky's fixed CSS size (Canvas.module.css .note: width 172px,
// min-height 172px) — notes don't auto-grow the way shapes do, so a fixed
// box is accurate, not a guess.
const NOTE_SIZE = 172;

// `body`/`label` are plain strings (see board-doc.ts's top-of-file comment),
// rendered by the browser's own text layout in the live canvas — there's no
// live DOM to measure here, so text/arrow bounds are a deliberate estimate,
// padded generously enough that "what got exported" always at least covers
// "what's visible," never clips it.
function textBounds(d: TextData): Rect {
  const fontSize = d.fontSize ?? 19;
  const w = Math.max(60, (d.body?.length ?? 0) * fontSize * 0.55);
  const h = fontSize * 1.4;
  return { x: d.x, y: d.y, w, h };
}

// Zero-width or zero-height line segments (a perfectly horizontal or
// vertical arrow) get a small pad on *only* the degenerate axis, so the
// resulting rect never has a zero-area side (which would make it vanish
// from union/intersection math) while the real axis stays exact.
const ARROW_DEGENERATE_PAD = 4;
function arrowBounds(x1: number, y1: number, x2: number, y2: number): Rect {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const w = maxX - minX;
  const h = maxY - minY;
  return {
    x: w === 0 ? minX - ARROW_DEGENERATE_PAD : minX,
    y: h === 0 ? minY - ARROW_DEGENERATE_PAD : minY,
    w: w === 0 ? ARROW_DEGENERATE_PAD * 2 : w,
    h: h === 0 ? ARROW_DEGENERATE_PAD * 2 : h,
  };
}

export function objectBounds(kind: "note", data: NoteData): Rect;
export function objectBounds(kind: "shape", data: ShapeData): Rect;
export function objectBounds(kind: "text", data: TextData): Rect;
export function objectBounds(kind: "frame", data: FrameData): Rect;
export function objectBounds(kind: "arrow", data: ArrowData): Rect;
export function objectBounds(kind: "image", data: ImageData): Rect;
export function objectBounds(
  kind: ExportKind,
  data: NoteData | ShapeData | TextData | FrameData | ArrowData | ImageData,
): Rect {
  switch (kind) {
    case "note": {
      const d = data as NoteData;
      return { x: d.x, y: d.y, w: NOTE_SIZE, h: NOTE_SIZE };
    }
    case "shape": {
      const d = data as ShapeData;
      return { x: d.x, y: d.y, w: d.w, h: d.h };
    }
    case "frame": {
      const d = data as FrameData;
      return { x: d.x, y: d.y, w: d.w, h: d.h };
    }
    case "image": {
      const d = data as ImageData;
      return { x: d.x, y: d.y, w: d.w, h: d.h };
    }
    case "text":
      return textBounds(data as TextData);
    case "arrow": {
      const d = data as ArrowData;
      // Callers pass already-resolved endpoints for bound arrows (see
      // Canvas.tsx's resolveBinding) — raw x1..y2 can be stale while an
      // endpoint is bound (documented trade-off, CLAUDE.md progress log,
      // Epic B). This function just draws the box around whatever
      // coordinates it's given.
      return arrowBounds(d.x1, d.y1, d.x2, d.y2);
    }
  }
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

// Inclusion is by intersection, not containment — a sticky half-hanging out
// of the marquee/frame/whole-board region still exports (PLAN.md F1b).
export function objectsInRegion<T extends { bounds: Rect }>(objects: T[], region: Rect): T[] {
  return objects.filter((o) => intersects(o.bounds, region));
}

export interface FitResult {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Computes the scale + top-left offset (in *page* coordinates, i.e. how far
// from the page's own origin — not the content rect's origin — the scaled
// content should be drawn) that fits `content` onto a `pageW`×`pageH` page
// with `margin` on every side, preserving aspect ratio and centering on the
// non-limiting axis. The caller is responsible for translating by
// `-content.x, -content.y` *before* applying this scale/offset, since this
// function only ever reasons about `content`'s width/height, never its
// absolute position.
export function fitToPage(content: Rect, pageW: number, pageH: number, margin: number): FitResult {
  const availW = Math.max(0, pageW - margin * 2);
  const availH = Math.max(0, pageH - margin * 2);
  // A zero-area content rect (nothing to export, or a degenerate marquee)
  // would otherwise divide by zero and produce NaN/Infinity — fall back to
  // a 1×1 content size so scale stays a finite, positive number instead.
  const safeW = content.w > 0 ? content.w : 1;
  const safeH = content.h > 0 ? content.h : 1;
  let scale = Math.min(availW / safeW, availH / safeH);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  const offsetX = margin + (availW - safeW * scale) / 2;
  const offsetY = margin + (availH - safeH * scale) / 2;
  return { scale, offsetX, offsetY };
}
