// F1b: draws a resolved list of board objects onto an offscreen <canvas>,
// then hands that canvas to jsPDF as a single embedded image. Deliberately
// NOT html2canvas/DOM capture — this board uses CSS custom properties,
// `foreignObject`, and rotated diamonds, all of which html2canvas handles
// unreliably. Re-drawing from the Yjs model (which this file fully
// controls) sidesteps all of that.
//
// This module is the "thin, untestable in jsdom" half PLAN.md calls out —
// all the actual logic (what's included, how it's scaled/positioned) lives
// in export-bounds.ts and is exhaustively unit-tested there instead.
import jsPDF from "jspdf";
import { elbowPoints, roundedPath } from "./connector-path";
import { fitToPage, type Rect } from "./export-bounds";
import { NOTE_COLORS } from "./palette";
import type { NoteData, ShapeData, TextData, FrameData, ArrowData, ImageData, ShapeKind, Side } from "./board-doc";

// Arrows carry their bound-side info (if any) only for the duration of an
// export — ArrowData itself doesn't have these fields; Canvas.tsx resolves
// bindings into concrete coordinates before calling this module (see
// resolveBinding's use in ArrowItem) and can optionally pass along which
// sides were bound so elbow routing matches the live canvas exactly.
export type ResolvedArrowData = ArrowData & { sideA?: Side; sideB?: Side };

export type DrawableObject =
  | { kind: "note"; id: string; data: NoteData }
  | { kind: "shape"; id: string; data: ShapeData }
  | { kind: "text"; id: string; data: TextData }
  | { kind: "frame"; id: string; data: FrameData }
  | { kind: "image"; id: string; data: ImageData }
  | { kind: "arrow"; id: string; data: ResolvedArrowData };

// The exported PDF always renders as if on a plain white page in "light"
// colors, regardless of the app's current theme — `--ink` resolves to a
// light color in dark mode, which would be invisible on a white page. A
// print/export artifact having its own fixed, theme-independent look is the
// same call `.note`'s hardcoded `#33240a` text already makes for the same
// reason (see CLAUDE.md's theme-toggle progress notes).
const EXPORT_BG = "#ffffff";
const EXPORT_INK = "#211d16";
const NOTE_SIZE = 172;
const DEVICE_SCALE = 2;
const MARGIN_PT = 28;
const PAGE_PORTRAIT: [number, number] = [612, 792]; // US Letter, points
const PAGE_LANDSCAPE: [number, number] = [792, 612];

function pageFormatFor(region: Rect): [number, number] {
  return region.w >= region.h ? PAGE_LANDSCAPE : PAGE_PORTRAIT;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shapePath(ctx: CanvasRenderingContext2D, kind: ShapeKind, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
  } else if (kind === "diamond") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, w, h, 8);
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 8) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let cy = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  style: Exclude<ArrowData["headEnd"], "none" | undefined>,
  color: string,
) {
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const px = -uy;
  const py = ux;
  const size = Math.max(6, 3 * 3.2);
  ctx.save();
  ctx.fillStyle = color;
  if (style === "circle") {
    ctx.beginPath();
    ctx.arc(tipX, tipY, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "diamond") {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * size * 0.6 + px * size * 0.35, tipY - uy * size * 0.6 + py * size * 0.35);
    ctx.lineTo(tipX - ux * size * 1.1, tipY - uy * size * 1.1);
    ctx.lineTo(tipX - ux * size * 0.6 - px * size * 0.35, tipY - uy * size * 0.6 - py * size * 0.35);
    ctx.closePath();
    ctx.fill();
  } else {
    // "arrow" and "triangle" both render as a filled chevron — a
    // reasonable approximation given the whole export is a rasterized
    // page, not a vector reproduction (PLAN.md accepts that trade-off).
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * size + px * size * 0.45, tipY - uy * size + py * size * 0.45);
    ctx.lineTo(tipX - ux * size - px * size * 0.45, tipY - uy * size - py * size * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, data: ResolvedArrowData) {
  const { x1, y1, x2, y2 } = data;
  const strokeWidth = data.strokeWidth ?? 2.5;
  const curve = data.curve ?? 0;
  const routing = data.routing ?? (curve !== 0 ? "curved" : "straight");

  let pathD: string;
  if (routing === "elbow") {
    pathD = roundedPath(elbowPoints({ x: x1, y: y1 }, { x: x2, y: y2 }, data.sideA, data.sideB));
  } else if (routing === "curved") {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = (x1 + x2) / 2 + nx * curve;
    const cy = (y1 + y2) / 2 + ny * curve;
    pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  } else {
    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  ctx.save();
  ctx.strokeStyle = EXPORT_INK;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(pathD));
  ctx.restore();

  const headEnd = data.headEnd ?? "arrow";
  const headStart = data.headStart ?? "none";
  if (headEnd !== "none") drawArrowhead(ctx, x2, y2, x2 - x1, y2 - y1, headEnd, EXPORT_INK);
  if (headStart !== "none") drawArrowhead(ctx, x1, y1, x1 - x2, y1 - y2, headStart, EXPORT_INK);
}

function drawObject(ctx: CanvasRenderingContext2D, obj: DrawableObject, imageEls: Map<string, HTMLImageElement>) {
  switch (obj.kind) {
    case "frame": {
      const { x, y, w, h, label } = obj.data;
      ctx.save();
      ctx.strokeStyle = "#c9c2b4";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#6b6355";
      ctx.font = "600 11px monospace";
      ctx.textBaseline = "bottom";
      ctx.fillText((label || "FRAME").toUpperCase(), x, Math.max(10, y - 8));
      ctx.restore();
      return;
    }
    case "note": {
      const { x, y, color, body } = obj.data;
      const c = NOTE_COLORS[color] ?? NOTE_COLORS[0];
      ctx.save();
      roundRectPath(ctx, x, y, NOTE_SIZE, NOTE_SIZE, 10);
      ctx.fillStyle = c.bg;
      ctx.fill();
      ctx.fillStyle = "#33240a";
      ctx.font = "15px sans-serif";
      ctx.textBaseline = "alphabetic";
      wrapText(ctx, body, x + 14, y + 30, NOTE_SIZE - 28, 19);
      ctx.restore();
      return;
    }
    case "shape": {
      const { kind, x, y, w, h, color, body } = obj.data;
      const c = NOTE_COLORS[color] ?? NOTE_COLORS[0];
      ctx.save();
      shapePath(ctx, kind, x, y, w, h);
      ctx.fillStyle = `${c.bg}2e`; // same alpha-suffix convention as ShapeItem
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = c.bg;
      ctx.stroke();
      ctx.fillStyle = EXPORT_INK;
      ctx.font = "500 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      wrapText(ctx, body, x + w / 2, y + h / 2, w - 20, 17);
      ctx.restore();
      return;
    }
    case "text": {
      const { x, y, body, fontSize } = obj.data;
      const size = fontSize ?? 19;
      ctx.save();
      ctx.fillStyle = EXPORT_INK;
      ctx.font = `600 ${size}px sans-serif`;
      ctx.textBaseline = "alphabetic";
      wrapText(ctx, body, x, y + size, 420, size * 1.3);
      ctx.restore();
      return;
    }
    case "image": {
      const img = imageEls.get(obj.data.url);
      ctx.save();
      if (img) {
        ctx.drawImage(img, obj.data.x, obj.data.y, obj.data.w, obj.data.h);
      } else {
        // Failed to load (network error, or a CORS-restrictive host — see
        // preloadImages) — draw a labeled placeholder instead of silently
        // dropping the object or aborting the whole export.
        ctx.strokeStyle = "#c9c2b4";
        ctx.strokeRect(obj.data.x, obj.data.y, obj.data.w, obj.data.h);
        ctx.fillStyle = "#8a8272";
        ctx.font = "12px sans-serif";
        ctx.fillText("image unavailable", obj.data.x + 8, obj.data.y + 18);
      }
      ctx.restore();
      return;
    }
    case "arrow":
      drawArrow(ctx, obj.data);
  }
}

async function preloadImages(objects: DrawableObject[]): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  for (const o of objects) if (o.kind === "image") urls.add(o.data.url);
  const entries = await Promise.all(
    Array.from(urls).map(
      (url) =>
        new Promise<[string, HTMLImageElement | null]>((resolve) => {
          const img = new Image();
          // Required for a cross-origin (Supabase Storage) image to be
          // drawable onto a canvas that's later read back via toDataURL —
          // without it, the canvas is "tainted" and toDataURL throws.
          // Supabase's public-bucket URLs send permissive CORS headers, but
          // this can't be verified in this sandbox (the board-images bucket
          // hasn't been created in the real project yet — see handoff).
          img.crossOrigin = "anonymous";
          img.onload = () => resolve([url, img]);
          img.onerror = () => resolve([url, null]);
          img.src = url;
        }),
    ),
  );
  const map = new Map<string, HTMLImageElement>();
  for (const [url, img] of entries) if (img) map.set(url, img);
  return map;
}

/** Renders `objects` (already filtered to `region`) to a single-page PDF and triggers a download. */
export async function exportToPdf(objects: DrawableObject[], region: Rect, filename: string): Promise<void> {
  const [pageW, pageH] = pageFormatFor(region);
  const { scale, offsetX, offsetY } = fitToPage(region, pageW, pageH, MARGIN_PT);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pageW * DEVICE_SCALE));
  canvas.height = Math.max(1, Math.round(pageH * DEVICE_SCALE));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  ctx.fillStyle = EXPORT_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(DEVICE_SCALE, DEVICE_SCALE);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-region.x, -region.y);

  const imageEls = await preloadImages(objects);
  // Frames first so notes/shapes/text/images/arrows draw on top of the
  // frame outline, not under it — matches the live canvas's z-order
  // (FrameItem has `z-index: 1`, everything else layers above it).
  const ordered = [...objects].sort((a, b) => (a.kind === "frame" ? -1 : b.kind === "frame" ? 1 : 0));
  for (const obj of ordered) drawObject(ctx, obj, imageEls);

  const pdf = new jsPDF({ unit: "pt", format: [pageW, pageH] });
  const dataUrl = canvas.toDataURL("image/png");
  pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
  pdf.save(filename);
}
