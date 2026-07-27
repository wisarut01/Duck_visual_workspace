"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Canvas.module.css";
import topbarStyles from "./BoardShell.module.css";
import { NOTE_COLORS, TEXT_COLORS, textColorVar } from "@/lib/palette";
import { touchBoard, fetchMe, uploadImage } from "@/lib/api";
import {
  type BoardDoc,
  type NoteData,
  type ShapeData,
  type TextData,
  type FrameData,
  type ArrowData,
  type ImageData,
  type ShapeKind,
  type Presence,
  type TextAlign,
  type ArrowHead,
  type Routing,
  type Side,
  type Binding,
  createBoardDoc,
  connectRealtime,
  addNote,
  addShape,
  addText,
  addFrame,
  addArrow,
  addImage,
  updateFields,
  deleteObj,
  getBoardName,
  setBoardName,
  onBoardNameChange,
} from "@/lib/board-doc";
import { useYCollection } from "@/hooks/useYCollection";
import { elbowPoints, roundedPath, elbowMidpoint } from "@/lib/connector-path";
import { toolbarStyle, centeredToolbarStyle, counterScale, screenPxToWorld, zoomInv } from "@/lib/screen-space";
// Note: not importing aspect-resize's `Corner` type — Canvas.tsx already
// declares its own identical "nw"|"ne"|"sw"|"se" union locally (used by the
// shared ResizeHandles component below); importing a second, structurally
// identical `Corner` under the same name would collide with it.
import { aspectResize } from "@/lib/aspect-resize";
import { objectBounds, objectsInRegion, type Rect as ExportRect } from "@/lib/export-bounds";
import { exportToPdf, type DrawableObject, type ResolvedArrowData } from "@/lib/export-pdf";
import ThemeToggle from "./ThemeToggle";
import type { WebsocketProvider } from "y-websocket";

type ConnState = "connecting" | "connected" | "disconnected";
interface RemotePresence extends Presence {
  clientId: number;
}

type Tool = "select" | "pan" | "note" | "text" | "rect" | "ellipse" | "diamond" | "frame" | "arrow" | "image";
type ObjKind = "note" | "shape" | "text" | "frame" | "arrow" | "image";
type Selection = { kind: ObjKind; id: string } | null;

interface ViewState {
  x: number;
  y: number;
  s: number;
}

// ---- shared drag hook for a single free-standing object (note/shape/text) ----
// Click selects; drag moves; double-click focuses the text for editing.
// (Single click never focuses text — a focused contenteditable eats the
// next pointerdown, which was a real bug when this was prototyped in raw DOM.)
const DBLCLICK_MS = 400;
const DBLCLICK_PX = 6;

// Every select-mode pointerdown here calls preventDefault() — without it, a
// plain click on the body's contentEditable natively focuses it, which
// contradicts "click selects, double-click edits" (a single click would
// start text editing, and a subsequent Delete keypress would forward-delete
// a character instead of deleting the object). But per the Pointer Events
// spec, preventDefault() on pointerdown suppresses the *entire* legacy
// mouse-event compatibility chain for that interaction — click, dblclick,
// all of it. That was verified empirically: with preventDefault() in place,
// neither a React onClick nor onDoubleClick on the same subtree ever fires,
// for any element, not just the one under the pointer. So double-click
// can't be detected via the dblclick event at all here — it has to be
// reconstructed from consecutive pointerdowns' timing/position instead,
// which is what bodyRef + the two constants above are for.
function useSimpleDrag(
  board: BoardDoc,
  container: NoteKind,
  kind: ObjKind,
  id: string,
  x: number,
  y: number,
  view: ViewState,
  tool: Tool,
  onSelect: (s: Selection) => void,
  bodyRef: React.RefObject<HTMLElement | null>,
) {
  const startRef = useRef<{ mx: number; my: number; ox: number; oy: number; moved: boolean } | null>(null);
  const lastDownRef = useRef<{ t: number; x: number; y: number } | null>(null);
  return {
    onPointerDown(e: React.PointerEvent) {
      if (tool !== "select") return;
      e.stopPropagation();
      e.preventDefault();

      const now = performance.now();
      const last = lastDownRef.current;
      lastDownRef.current = { t: now, x: e.clientX, y: e.clientY };
      if (last && now - last.t < DBLCLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DBLCLICK_PX) {
        lastDownRef.current = null; // consumed — a third rapid click starts fresh
        bodyRef.current?.focus();
        return;
      }

      startRef.current = { mx: e.clientX, my: e.clientY, ox: x, oy: y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent) {
      const s = startRef.current;
      if (!s) return;
      const dx = (e.clientX - s.mx) / view.s;
      const dy = (e.clientY - s.my) / view.s;
      if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true;
      if (s.moved) updateFields(board.doc, container, id, { x: s.ox + dx, y: s.oy + dy });
    },
    onPointerUp() {
      const s = startRef.current;
      startRef.current = null;
      if (s && !s.moved) onSelect({ kind, id });
    },
  };
}

type NoteKind = BoardDoc["notes"];

const FONT_STACK: Record<import("@/lib/board-doc").FontFamily, string> = {
  ui: "var(--font-ui)",
  mono: "var(--font-mono)",
};

// F6: a contentEditable body's native Ctrl/Cmd+B/I/U inserts <b>/<i>/<u>
// tags that onBlur's `textContent` read then silently discards, losing the
// edit. Suppress those keys and route them to the element-level style
// fields instead (bold/italic/underline are whole-element, not
// per-character — see the TextStyleFields comment in board-doc.ts).
function handleStyleKeyDown(
  e: React.KeyboardEvent,
  current: { bold?: boolean; italic?: boolean; underline?: boolean },
  onChange: (patch: { bold?: boolean; italic?: boolean; underline?: boolean }) => void,
) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "b") {
    e.preventDefault();
    onChange({ bold: !current.bold });
  } else if (k === "i") {
    e.preventDefault();
    onChange({ italic: !current.italic });
  } else if (k === "u") {
    e.preventDefault();
    onChange({ underline: !current.underline });
  }
}

// Leaves fontWeight/fontStyle/textDecoration undefined (not "normal"/400)
// when the flag is off, so each kind's own CSS default keeps applying —
// note/shape/text each start from a different base weight today (400/500/600
// respectively; see .noteBody/.shapeBody/.textBody in Canvas.module.css) and
// this must not flatten that.
function bodyStyleFields(
  data: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    textColor?: number;
  },
  // Sticky notes keep a pastel background in both themes, so their text must
  // stay dark; shape/text bodies sit on the themed canvas and flip with it.
  // See textColorVar()/TEXT_COLORS in src/lib/palette.ts.
  colorVariant: "themed" | "fixed" = "themed",
): { fontWeight: number | undefined; fontStyle: string | undefined; textDecoration: string | undefined; color: string | undefined } {
  return {
    fontWeight: data.bold ? 700 : undefined,
    fontStyle: data.italic ? "italic" : undefined,
    textDecoration: data.underline ? "underline" : undefined,
    color: data.textColor !== undefined ? textColorVar(data.textColor, colorVariant) : undefined,
  };
}

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 96;
const FONT_SIZE_STEP = 2;
const ARROW_SNAP_PAD_PX = 28;
const ARROW_STROKE_PRESETS = [1.5, 2.5, 4, 6.5];
// F1b export menu — plain inline style object (not a CSS module class) so
// this feature adds zero lines to Canvas.module.css, kept minimal on
// purpose while other agents are concurrently editing that same file.
const EXPORT_MENU_ITEM_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "var(--ink)",
  font: "600 13px var(--font-ui)",
  cursor: "pointer",
};
const ARROW_STROKE_DEFAULT = 2.5;
const ARROW_HEAD_STYLES: ArrowHead[] = ["none", "arrow", "triangle", "circle", "diamond"];
const ROUTING_MODES: Routing[] = ["straight", "curved", "elbow"];
// F2: constant on-screen gap (px) between an element and its screen-space
// toolbar's bottom edge. Converted to world units per-render via
// screenPxToWorld() so it stays this size on screen at any zoom.
//
// Both FontToolbar and ConnectorToolbar position the toolbar with CSS
// `bottom: 0` against a wrapper whose own bottom edge is placed at exactly
// `anchorY - screenPxToWorld(gapPx, zoom)`. That indirection matters: a
// naive `top: anchorY - screenPxToWorld(gapPx, zoom)` directly on the
// counter-scaled, bottom-origin toolbar div would need to *also* know the
// toolbar's own unscaled layout height to land its actual (scaled) bottom
// edge at the right spot — `top + height` is what the `transform-origin:
// 50% 100%` point resolves to, and that `height` term ends up multiplied
// by `zoom` on the way to the screen, undoing the constant-gap conversion
// everywhere except zoom 1. Pinning via a zero-size wrapper + `bottom: 0`
// sidesteps needing that height at all: `bottom: 0` places the origin
// point at the wrapper's exact (already zoom-corrected) bottom edge,
// independent of the toolbar's own rendered size.
const FONT_TOOLBAR_GAP_PX = 8;
// ConnectorToolbar's box: constant on-screen footprint (px) the
// <foreignObject> is sized to at any zoom (safety margin against
// foreignObject `overflow: visible` clipping inconsistencies — see
// ConnectorToolbar below), and the constant on-screen gap between the
// box's bottom edge and the connector's midpoint. Re-measured after F2's
// ~1.35x control bump — was a hardcoded `width = 372` (unmeasured, per
// PLAN.md's own note).
const CONNECTOR_TOOLBAR_WIDTH_PX = 620;
const CONNECTOR_TOOLBAR_HEIGHT_PX = 48;
const CONNECTOR_TOOLBAR_GAP_PX = 20;
// F5: same constant-screen-gap idea, for the frame label tab and delete
// button — both pinned to a frame corner via a zero-size wrapper +
// `bottom: 0` (see FrameItem), same reasoning as FONT_TOOLBAR_GAP_PX above
// for why that's needed instead of a naive `top` offset.
const FRAME_LABEL_GAP_PX = 6;
const FRAME_DEL_GAP_PX = 6;
// A small extension of React.CSSProperties for the one CSS custom property
// this file sets from JS: `--zoom-inv` (1/view.s), read by
// Canvas.module.css's `.anchor`/`.resizeHandle`/`.a-*` rules to counter-
// scale (F2). CSSProperties itself has no index signature for custom
// properties in the csstype version this repo pins, hence the extension.
interface ZoomVarStyle extends React.CSSProperties {
  "--zoom-inv"?: string | number;
}
// Epic C quick-create: gap (world units) between a shape and the sibling
// created off one of its hover anchors, and how many times to step further
// out along the same axis if the spot is already occupied.
const QUICK_CREATE_GAP = 60;
const QUICK_CREATE_MAX_STEPS = 20;
// Click-vs-drag threshold (screen px) for a shape's hover anchor: under this,
// pointerdown+up is a quick-create click; over it, it's a connector drag.
const ANCHOR_CLICK_PX = 4;

// Which kinds share this toolbar and which of its groups apply to each —
// note/shape/text all get font controls; color is note+shape (F3); shape
// alone additionally gets border thickness + fill toggle (F3).
type ElementKind = "note" | "shape" | "text";

// Shared floating control shown above a selected note/shape/text: font size
// +/- and a sans/mono family toggle (the only two families DESIGN.md defines
// — no serif, to keep the "engineering instrument" look, not "generic AI tool"),
// a left/center/right text-align group (Epic D), (F3) per-kind color /
// border-thickness / fill-toggle groups, (F6) bold/italic/underline + text
// color, and (F4) a delete button. Was `FontToolbar`; renamed + exported
// once it grew beyond font controls.
//
// F2: `zoom` (view.s) drives a counter-scale (src/lib/screen-space.ts) so
// this renders at a constant on-screen size regardless of zoom — it's a
// child of the zoom-`transform`ed `.world` div like every other object, so
// without this it shrinks/grows with the canvas the same as a note or shape
// would. `x`/`y` stay world coordinates (unchanged); only the toolbar's own
// `transform` and its vertical offset from `y` are zoom-compensated.
export function ElementToolbar({
  x,
  y,
  zoom,
  fontSize,
  fontFamily,
  textAlign,
  kind,
  color,
  strokeWidth,
  filled,
  bold,
  italic,
  underline,
  textColor,
  onChange,
  onDelete,
}: {
  x: number;
  y: number;
  zoom: number;
  fontSize: number;
  fontFamily: import("@/lib/board-doc").FontFamily;
  textAlign: TextAlign;
  kind: ElementKind;
  color?: number;
  strokeWidth?: number;
  filled?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: number;
  onDelete?: () => void;
  onChange: (patch: {
    fontSize?: number;
    fontFamily?: import("@/lib/board-doc").FontFamily;
    textAlign?: TextAlign;
    color?: number;
    strokeWidth?: number;
    filled?: boolean;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    textColor?: number;
  }) => void;
}) {
  // Zero-size positioning anchor at (x, y - gap) — see FONT_TOOLBAR_GAP_PX's
  // comment for why the toolbar pins to *this* wrapper's bottom edge via
  // CSS `bottom: 0` (in .fontToolbar) rather than computing its own `top`.
  const anchorStyle: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y - screenPxToWorld(FONT_TOOLBAR_GAP_PX, zoom),
    width: 0,
    height: 0,
  };
  const showColor = kind === "note" || kind === "shape";
  const showShapeControls = kind === "shape";
  const isFilled = filled !== false;
  return (
    <div style={anchorStyle}>
      <div className={styles.fontToolbar} style={toolbarStyle(zoom)} onPointerDown={(e) => e.stopPropagation()}>
        <div className={styles.ftRow}>
          <button onClick={() => onChange({ fontSize: Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP) })}>A−</button>
          <span>{fontSize}</span>
          <button onClick={() => onChange({ fontSize: Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP) })}>A+</button>
          <div className={styles.ftSep} />
          <button className={fontFamily === "ui" ? styles.ftActive : ""} onClick={() => onChange({ fontFamily: "ui" })}>
            Sans
          </button>
          <button className={fontFamily === "mono" ? styles.ftActive : ""} onClick={() => onChange({ fontFamily: "mono" })}>
            Mono
          </button>
          <div className={styles.ftSep} />
          {(["left", "center", "right"] as TextAlign[]).map((a) => (
            <button
              key={a}
              className={textAlign === a ? styles.ftActive : ""}
              title={`Align ${a}`}
              onClick={() => onChange({ textAlign: a })}
            >
              <svg width={13} height={13} viewBox="0 0 24 24">
                {a === "left" && (
                  <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                )}
                {a === "center" && (
                  <path d="M4 6h16M8 12h8M5 18h14" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                )}
                {a === "right" && (
                  <path d="M4 6h16M10 12h10M6 18h14" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                )}
              </svg>
            </button>
          ))}
        </div>

        {showColor && (
          <div className={styles.ftRow}>
            <span className={styles.ctLabel}>Fill</span>
            <div className={styles.ctGroup}>
              {NOTE_COLORS.map((c, i) => (
                <button
                  key={c.tag}
                  className={`${styles.swatchBtn} ${color === i ? styles.swatchActive : ""}`}
                  style={{ background: c.bg }}
                  title={`Color ${c.tag}`}
                  onClick={() => onChange({ color: i })}
                />
              ))}
            </div>
          </div>
        )}

        {showShapeControls && (
          <div className={styles.ftRow}>
            <div className={styles.ctGroup}>
              {ARROW_STROKE_PRESETS.map((w) => (
                <button
                  key={w}
                  className={strokeWidth === w ? styles.ftActive : ""}
                  title={`${w}px`}
                  onClick={() => onChange({ strokeWidth: w })}
                >
                  <svg width={18} height={16} viewBox="0 0 20 16">
                    <line x1={2} y1={8} x2={18} y2={8} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
            <div className={styles.ftSep} />
            <button
              className={!isFilled ? styles.ftActive : ""}
              title={isFilled ? "Outline only" : "Fill"}
              onClick={() => onChange({ filled: !isFilled })}
            >
              <svg width={15} height={15} viewBox="0 0 24 24">
                <rect
                  x={4}
                  y={4}
                  width={16}
                  height={16}
                  rx={3}
                  fill={isFilled ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={2}
                />
              </svg>
            </button>
          </div>
        )}

        <div className={styles.ftRow}>
          <div className={styles.ctGroup}>
            <button
              className={bold ? styles.ftActive : ""}
              title="Bold"
              style={{ fontWeight: 700 }}
              onClick={() => onChange({ bold: !bold })}
            >
              B
            </button>
            <button
              className={italic ? styles.ftActive : ""}
              title="Italic"
              style={{ fontStyle: "italic" }}
              onClick={() => onChange({ italic: !italic })}
            >
              I
            </button>
            <button
              className={underline ? styles.ftActive : ""}
              title="Underline"
              style={{ textDecoration: "underline" }}
              onClick={() => onChange({ underline: !underline })}
            >
              U
            </button>
          </div>
          <div className={styles.ftSep} />
          <div className={styles.ctGroup}>
            <button
              className={`${styles.swatchBtn} ${styles.swatchInk} ${textColor === undefined ? styles.swatchActive : ""}`}
              title="Auto text color (theme default)"
              onClick={() => onChange({ textColor: undefined })}
            />
            {TEXT_COLORS.map((c, i) => (
              <button
                key={c.name}
                className={`${styles.swatchBtn} ${textColor === i ? styles.swatchActive : ""}`}
                // Swatch shows the color as it will actually render in the
                // active theme (see textColorVar / --text-N in globals.css).
                style={{ background: textColorVar(i, "themed") }}
                title={`Text color ${c.name}`}
                onClick={() => onChange({ textColor: i })}
              />
            ))}
          </div>
          {onDelete && (
            <div className={styles.ctDeleteGroup}>
              <button className={styles.deleteBtn} title="Delete" onClick={onDelete}>
                <svg width={15} height={15} viewBox="0 0 24 24">
                  <path
                    d="M5 6h14M9 6V4h6v2M7 6l1 14h8l1-14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Epic B: resolves a connector endpoint bound to a shape into a concrete
// world point + concrete side. `side: "auto"` picks whichever of the
// shape's four bbox-side midpoints faces `otherX/otherY` — ellipse/diamond
// attach on the bbox too (acceptable per PLAN.md; their true outline attach
// would need per-kind geometry this pass didn't invest in).
function resolveBinding(
  shape: ShapeData,
  side: Side | "auto",
  otherX: number,
  otherY: number,
): { point: { x: number; y: number }; side: Side } {
  let s = side;
  if (s === "auto") {
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const dx = otherX - cx;
    const dy = otherY - cy;
    s = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : dy >= 0 ? "s" : "n";
  }
  switch (s) {
    case "n":
      return { point: { x: shape.x + shape.w / 2, y: shape.y }, side: "n" };
    case "s":
      return { point: { x: shape.x + shape.w / 2, y: shape.y + shape.h }, side: "s" };
    case "e":
      return { point: { x: shape.x + shape.w, y: shape.y + shape.h / 2 }, side: "e" };
    default:
      return { point: { x: shape.x, y: shape.y + shape.h / 2 }, side: "w" };
  }
}

// Marker <defs> ids are global to the document (SVG markers aren't scoped to
// their own <svg>), so this prefix only needs to be unique within a page —
// there's exactly one Canvas mounted at a time.
const ARROWHEAD_ID_PREFIX = "cb-arrowhead";
function arrowheadMarkerId(head: ArrowHead) {
  return `${ARROWHEAD_ID_PREFIX}-${head}`;
}

// One <marker> per style (not per style×strokeWidth): markerUnits="strokeWidth"
// scales it with the line automatically, and orient="auto-start-reverse"
// flips it correctly when used as marker-start vs marker-end. fill:
// context-stroke picks up the referencing path's actual stroke color
// (including the `.selected` accent override) for free — supported in all
// evergreen browsers this app already targets.
function ArrowheadDefs() {
  return (
    <defs>
      <marker
        id={arrowheadMarkerId("arrow")}
        viewBox="0 0 10 10"
        refX="7.5"
        refY="5"
        markerWidth="4.5"
        markerHeight="4.5"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M0.5,0.5 L9,5 L0.5,9.5" fill="none" stroke="context-stroke" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
      <marker
        id={arrowheadMarkerId("triangle")}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="4.5"
        markerHeight="4.5"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
      </marker>
      <marker
        id={arrowheadMarkerId("circle")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="3.6"
        markerHeight="3.6"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <circle cx="5" cy="5" r="4" fill="context-stroke" />
      </marker>
      <marker
        id={arrowheadMarkerId("diamond")}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="4.2"
        markerHeight="4.2"
        markerUnits="strokeWidth"
        orient="auto-start-reverse"
      >
        <path d="M5,0 L10,5 L5,10 L0,5 z" fill="context-stroke" />
      </marker>
    </defs>
  );
}

// Epic B "attract while dragging": rendered in the SVG world layer (not
// dependent on CSS :hover, since the pointer that's dragging a connector
// endpoint is captured elsewhere, not necessarily over this shape's DOM
// node) whenever a connector drag's endpoint is within snap range of a
// shape. Shows all 4 candidate anchor points, with the one that will
// actually be used picked out.
function AttractAnchors({ data, activeSide }: { data: ShapeData; activeSide: Side }) {
  const pts: { side: Side; x: number; y: number }[] = [
    { side: "n", x: data.x + data.w / 2, y: data.y },
    { side: "e", x: data.x + data.w, y: data.y + data.h / 2 },
    { side: "s", x: data.x + data.w / 2, y: data.y + data.h },
    { side: "w", x: data.x, y: data.y + data.h / 2 },
  ];
  return (
    <g pointerEvents="none">
      <rect
        x={data.x - 4}
        y={data.y - 4}
        width={data.w + 8}
        height={data.h + 8}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        rx={8}
      />
      {pts.map((p) => (
        <circle
          key={p.side}
          cx={p.x}
          cy={p.y}
          r={p.side === activeSide ? 6 : 4}
          fill={p.side === activeSide ? "var(--accent)" : "var(--panel)"}
          stroke="var(--accent)"
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

// ---- corner resize handles, shared by shapes & frames ----
type Corner = "nw" | "ne" | "sw" | "se";
function ResizeHandles({
  x,
  y,
  w,
  h,
  view,
  minW = 40,
  minH = 30,
  onResize,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  view: ViewState;
  minW?: number;
  minH?: number;
  onResize: (next: { x: number; y: number; w: number; h: number }) => void;
}) {
  const dragRef = useRef<{ corner: Corner; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  function down(corner: Corner) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = { corner, sx: e.clientX, sy: e.clientY, ox: x, oy: y, ow: w, oh: h };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / view.s;
    const dy = (e.clientY - d.sy) / view.s;
    let nx = d.ox, ny = d.oy, nw = d.ow, nh = d.oh;
    if (d.corner.includes("e")) nw = Math.max(minW, d.ow + dx);
    if (d.corner.includes("s")) nh = Math.max(minH, d.oh + dy);
    if (d.corner.includes("w")) {
      nw = Math.max(minW, d.ow - dx);
      nx = d.ox + (d.ow - nw);
    }
    if (d.corner.includes("n")) {
      nh = Math.max(minH, d.oh - dy);
      ny = d.oy + (d.oh - nh);
    }
    onResize({ x: nx, y: ny, w: nw, h: nh });
  }
  function up(e: React.PointerEvent) {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const corners: Corner[] = ["nw", "ne", "sw", "se"];
  // F2: `--zoom-inv` drives .resizeHandle's counter-scale in
  // Canvas.module.css so handles stay a constant, touch-sized 10px on
  // screen instead of shrinking with zoom.
  const wrapperStyle: ZoomVarStyle = {
    position: "absolute",
    left: x,
    top: y,
    width: w,
    height: h,
    pointerEvents: "none",
    "--zoom-inv": zoomInv(view.s),
  };
  return (
    <div style={wrapperStyle}>
      {corners.map((c) => (
        <div
          key={c}
          className={`${styles.resizeHandle} ${styles["rh-" + c]}`}
          onPointerDown={down(c)}
          onPointerMove={move}
          onPointerUp={up}
        />
      ))}
    </div>
  );
}

export interface CanvasProps {
  roomId: string;
  name: string;
  color: string;
}

export default function Canvas({ roomId, name, color }: CanvasProps) {
  const [board] = useState<BoardDoc>(() => createBoardDoc());
  const notes = useYCollection<NoteData>(board.notes);
  const shapes = useYCollection<ShapeData>(board.shapes);
  const texts = useYCollection<TextData>(board.texts);
  const frames = useYCollection<FrameData>(board.frames);
  const arrows = useYCollection<ArrowData>(board.arrows);
  const images = useYCollection<ImageData>(board.images);

  const [view, setView] = useState<ViewState>({ x: 0, y: 0, s: 1 });
  useEffect(() => {
    // One-time layout read: window size is unavailable during SSR, so the
    // initial camera position can only be centered once mounted client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ x: window.innerWidth / 2, y: window.innerHeight / 2, s: 1 });
  }, []);

  const [tool, setTool] = useState<Tool>("select");

  // ================= realtime transport (epic 4) =================
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [remotePeers, setRemotePeers] = useState<RemotePresence[]>([]);

  useEffect(() => {
    const me: Presence = { name, color, cursor: null, tool: "select" };
    const provider = connectRealtime(board, roomId, me);
    providerRef.current = provider;

    const onStatus = ({ status }: { status: string }) => {
      setConnState(status === "connected" ? "connected" : "connecting");
    };
    const onConnectionClose = () => setConnState("disconnected");
    const onAwarenessChange = () => {
      const localId = board.doc.clientID;
      const peers: RemotePresence[] = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId === localId) return;
        const p = state as Partial<Presence>;
        if (!p.name || !p.color) return;
        peers.push({ clientId, name: p.name, color: p.color, cursor: p.cursor ?? null, tool: p.tool ?? "select" });
      });
      setRemotePeers(peers);
    };

    provider.on("status", onStatus);
    provider.on("connection-close", onConnectionClose);
    provider.on("connection-error", onConnectionClose);
    provider.awareness.on("change", onAwarenessChange);

    return () => {
      provider.awareness.off("change", onAwarenessChange);
      provider.off("status", onStatus);
      provider.off("connection-close", onConnectionClose);
      provider.off("connection-error", onConnectionClose);
      provider.destroy();
      providerRef.current = null;
    };
    // Connects once per mount for this room; roomId/name/color are fixed
    // for the lifetime of a joined session (rejoining reloads the page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    providerRef.current?.awareness.setLocalStateField("tool", tool);
  }, [tool]);

  // ================= board name (synced via Yjs, cached for /dashboard) ==
  const [boardName, setBoardNameState] = useState("");
  useEffect(() => {
    // One-time read of the doc's current name at mount, then subscribes below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoardNameState(getBoardName(board));
    // Best-effort: only signed-in users have a dashboard to record this
    // visit against — a guest (401) just doesn't get board history saved.
    touchBoard(roomId, getBoardName(board) || roomId).catch(() => {});
    return onBoardNameChange(board, (n) => {
      setBoardNameState(n);
      touchBoard(roomId, n || roomId).catch(() => {});
    });
  }, [board, roomId]);
  function renameBoard(next: string) {
    setBoardNameState(next);
    setBoardName(board, next);
  }

  const [linkCopied, setLinkCopied] = useState(false);
  function shareBoard() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  }


  // ================= follow a peer's camera (epic 5) =================
  const [followingId, setFollowingId] = useState<number | null>(null);
  const followingIdRef = useRef<number | null>(null);
  useEffect(() => {
    followingIdRef.current = followingId;
  }, [followingId]);

  const remotePeersRef = useRef<RemotePresence[]>([]);
  useEffect(() => {
    remotePeersRef.current = remotePeers;
    // If the peer we're following left the room, stop — this reacts to an
    // external system (the awareness/presence list), so it belongs in an
    // effect rather than being derived at render time.
    if (followingId !== null && !remotePeers.some((p) => p.clientId === followingId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFollowingId(null);
    }
  }, [remotePeers, followingId]);

  const stopFollow = useCallback(() => setFollowingId(null), []);

  // Camera lerps toward the followed peer's last-known cursor every frame,
  // same easing the prototype (board.html) used. No-op (and no re-render)
  // while nobody is being followed.
  useEffect(() => {
    let raf = 0;
    function tick() {
      const fid = followingIdRef.current;
      if (fid !== null) {
        const peer = remotePeersRef.current.find((p) => p.clientId === fid);
        if (peer?.cursor) {
          const { x: cx, y: cy } = peer.cursor;
          setView((v) => ({
            ...v,
            x: v.x + (window.innerWidth / 2 - cx * v.s - v.x) * 0.12,
            y: v.y + (window.innerHeight / 2 - cy * v.s - v.y) * 0.12,
          }));
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const [activeColor, setActiveColor] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  // F4: single delete path shared by the keyboard shortcut and every
  // on-canvas delete button (ElementToolbar, ConnectorToolbar, frame's
  // `.del`), so undo grouping and selection-clearing can't drift apart
  // between call sites the way duplicated delete logic invites.
  const deleteSelection = useCallback(
    (sel: Selection) => {
      if (!sel) return;
      const containers: Record<ObjKind, NoteKind> = {
        note: board.notes,
        shape: board.shapes,
        text: board.texts,
        frame: board.frames,
        arrow: board.arrows,
        image: board.images,
      };
      deleteObj(board.doc, containers[sel.kind], sel.id);
      setSelection(null);
    },
    [board],
  );

  const bodyRefs = useRef<Record<string, HTMLElement | null>>({});
  const registerBody = useCallback((id: string, el: HTMLElement | null) => {
    bodyRefs.current[id] = el;
  }, []);
  useEffect(() => {
    if (justCreated) {
      bodyRefs.current[justCreated]?.focus();
      // Clears the one-shot "focus me" flag after consuming it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustCreated(null);
    }
  }, [justCreated, notes, shapes, texts]);

  function screenToWorld(px: number, py: number) {
    return { x: (px - view.x) / view.s, y: (py - view.y) / view.s };
  }

  // ---- pan ----
  const panRef = useRef<{ mx: number; my: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // ---- drag-to-draw (shape / frame / connector) ----
  const drawRef = useRef<{ tool: Tool; sx: number; sy: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [arrowPreview, setArrowPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ---- hover-anchor connector (Miro-style: drag from a shape's edge dot to
  // auto-create an arrow, snapping onto whichever shape it's dropped on;
  // click instead of drag quick-creates a connected sibling shape — Epic C) --
  const shapesById = useMemo(() => new Map(shapes.map((s) => [s.id, s.data])), [shapes]);

  // A pointerdown on an anchor doesn't commit to drag-a-connector until the
  // pointer has moved past ANCHOR_CLICK_PX; under that, pointerup is a
  // quick-create click instead (same click-vs-drag split as useSimpleDrag).
  const anchorPendingRef = useRef<{
    shapeId: string;
    side: Side;
    x: number;
    y: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const anchorDragRef = useRef<{ x1: number; y1: number; fromId?: string; fromSide?: Side } | null>(null);
  const [attractTarget, setAttractTarget] = useState<{ id: string; side: Side } | null>(null);

  const onAnchorPointerDown = useCallback(
    (shapeId: string, side: Side, x: number, y: number, clientX: number, clientY: number) => {
      anchorPendingRef.current = { shapeId, side, x, y, startClientX: clientX, startClientY: clientY };
    },
    [],
  );

  function findAttractTarget(px: number, py: number, excludeId?: string) {
    const pad = ARROW_SNAP_PAD_PX / view.s;
    return shapes.find(
      ({ id, data: sd }) =>
        id !== excludeId && px >= sd.x - pad && px <= sd.x + sd.w + pad && py >= sd.y - pad && py <= sd.y + sd.h + pad,
    );
  }

  // Same kind/size/color as `src`, offset one gap past its `side`, nudged
  // further out along that axis if the spot overlaps an existing shape.
  function quickCreateFromAnchor(shapeId: string, side: Side) {
    const src = shapesById.get(shapeId);
    if (!src) return;
    const stepX = src.w + QUICK_CREATE_GAP;
    const stepY = src.h + QUICK_CREATE_GAP;
    let nx = src.x;
    let ny = src.y;
    if (side === "e") nx += stepX;
    else if (side === "w") nx -= stepX;
    else if (side === "s") ny += stepY;
    else ny -= stepY;

    const overlaps = (x: number, y: number) =>
      shapes.some(({ data: o }) => x < o.x + o.w && x + src.w > o.x && y < o.y + o.h && y + src.h > o.y);
    let steps = 0;
    while (overlaps(nx, ny) && steps < QUICK_CREATE_MAX_STEPS) {
      if (side === "e") nx += stepX;
      else if (side === "w") nx -= stepX;
      else if (side === "s") ny += stepY;
      else ny -= stepY;
      steps += 1;
    }

    const opposite: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };
    const dstSide = opposite[side];
    const dst: ShapeData = { kind: src.kind, x: nx, y: ny, w: src.w, h: src.h, color: src.color, body: "" };
    const srcAnchor = resolveBinding(src, side, nx + dst.w / 2, ny + dst.h / 2).point;
    const dstAnchor = resolveBinding(dst, dstSide, src.x + src.w / 2, src.y + src.h / 2).point;

    const newId = addShape(board, src.kind, nx, ny, src.w, src.h, src.color);
    addArrow(board, srcAnchor.x, srcAnchor.y, dstAnchor.x, dstAnchor.y, {
      from: { id: shapeId, side },
      to: { id: newId, side: dstSide },
    });
    setSelection({ kind: "shape", id: newId });
    setJustCreated(newId);
  }
  // ================= F1a: images =================
  // Uploads require a real account even though the board itself allows
  // anonymous joining (see JoinCard) — an unauthenticated upload endpoint
  // would make the Storage bucket an open file host for anyone with the
  // URL. This is a one-shot fetch-then-setState on mount, same pattern
  // /dashboard already uses for the same check.
  const [isSignedIn, setIsSignedIn] = useState(false);
  useEffect(() => {
    fetchMe().then(({ data }) => {
      setIsSignedIn(!!data.user);
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  async function placeUploadedImage(url: string, width: number | null, height: number | null) {
    const place = (naturalW: number, naturalH: number) => {
      const long = Math.max(naturalW, naturalH) || 1;
      const scale = Math.min(1, 400 / long);
      const w = naturalW * scale;
      const h = naturalH * scale;
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      const id = addImage(board, center.x - w / 2, center.y - h / 2, w, h, url, naturalW, naturalH);
      setSelection({ kind: "image", id });
    };
    if (width && height) {
      place(width, height);
      return;
    }
    // Server-side dimension parsing doesn't cover every allowed format (see
    // image-dimensions.ts) — fall back to measuring the uploaded image
    // client-side once it's loaded.
    await new Promise<void>((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        place(img.naturalWidth || 400, img.naturalHeight || 400);
        resolve();
      };
      img.onerror = () => {
        place(400, 400);
        resolve();
      };
      img.src = url;
    });
  }

  async function onImageFileSelected(file: File) {
    const { ok, data } = await uploadImage(file);
    if (!ok || !data.url) {
      window.alert(data.error ?? "Image upload failed.");
      return;
    }
    await placeUploadedImage(data.url, data.width ?? null, data.height ?? null);
  }

  // Clicking the toolbar's image tool (or pressing "I") opens the file
  // picker immediately rather than entering a persistent draw-mode like
  // rect/ellipse/etc — there's nothing to drag-to-draw, so "image" reverts
  // to "select" the instant it's chosen. This is a one-shot reaction to a
  // tool switch, same shape as `justCreated`'s consume-and-clear effect below.
  useEffect(() => {
    if (tool === "image") {
      if (isSignedIn) {
        fileInputRef.current?.click();
      } else {
        // Previously silent: the button's only explanation was its hover
        // title, so a guest clicking it saw nothing happen at all and had
        // no way to tell "locked" apart from "broken". A one-shot alert is
        // the same pattern onImageFileSelected already uses for upload
        // failures below.
        window.alert("Sign in to add images — use “My boards” in the top-left corner.");
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTool("select");
    }
  }, [tool, isSignedIn]);

  // ================= F1b: PDF export =================
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportSelecting, setExportSelecting] = useState(false);
  const exportMarqueeRef = useRef<{ sx: number; sy: number } | null>(null);
  const [exportMarqueePreview, setExportMarqueePreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Reuses the same `shapesById` map ArrowItem/AttractAnchors rely on
  // (defined further down this component, but this function is only ever
  // *called* from a later event handler, by which point that const has
  // long since been assigned for the current render).
  function resolveArrowsForExport(): { id: string; data: ResolvedArrowData }[] {
    return arrows.map(({ id, data }) => {
      const boundA = data.from ? shapesById.get(data.from.id) : undefined;
      const boundB = data.to ? shapesById.get(data.to.id) : undefined;
      const resolvedA = boundA && data.from ? resolveBinding(boundA, data.from.side, data.x2, data.y2) : null;
      const resolvedB =
        boundB && data.to
          ? resolveBinding(
              boundB,
              data.to.side,
              resolvedA ? resolvedA.point.x : data.x1,
              resolvedA ? resolvedA.point.y : data.y1,
            )
          : null;
      return {
        id,
        data: {
          ...data,
          x1: resolvedA ? resolvedA.point.x : data.x1,
          y1: resolvedA ? resolvedA.point.y : data.y1,
          x2: resolvedB ? resolvedB.point.x : data.x2,
          y2: resolvedB ? resolvedB.point.y : data.y2,
          sideA: resolvedA?.side,
          sideB: resolvedB?.side,
        },
      };
    });
  }

  async function runExport(region: ExportRect, filename: string) {
    const arrowsResolved = resolveArrowsForExport();
    const candidates = [
      ...notes.map(({ id, data }) => ({ id, bounds: objectBounds("note", data) })),
      ...shapes.map(({ id, data }) => ({ id, bounds: objectBounds("shape", data) })),
      ...texts.map(({ id, data }) => ({ id, bounds: objectBounds("text", data) })),
      ...frames.map(({ id, data }) => ({ id, bounds: objectBounds("frame", data) })),
      ...images.map(({ id, data }) => ({ id, bounds: objectBounds("image", data) })),
      ...arrowsResolved.map(({ id, data }) => ({ id, bounds: objectBounds("arrow", data) })),
    ];
    // Object ids are prefixed per-kind by newId() in board-doc.ts
    // (note-/shape-/text-/frame-/image-/arrow-), so a plain id is already
    // unique across every collection here — no compound key needed.
    const includedIds = new Set(objectsInRegion(candidates, region).map((o) => o.id));

    const drawables: DrawableObject[] = [];
    for (const { id, data } of notes) if (includedIds.has(id)) drawables.push({ kind: "note", id, data });
    for (const { id, data } of shapes) if (includedIds.has(id)) drawables.push({ kind: "shape", id, data });
    for (const { id, data } of texts) if (includedIds.has(id)) drawables.push({ kind: "text", id, data });
    for (const { id, data } of frames) if (includedIds.has(id)) drawables.push({ kind: "frame", id, data });
    for (const { id, data } of images) if (includedIds.has(id)) drawables.push({ kind: "image", id, data });
    for (const { id, data } of arrowsResolved) if (includedIds.has(id)) drawables.push({ kind: "arrow", id, data });

    if (drawables.length === 0) {
      window.alert("Nothing to export in that region.");
      return;
    }
    await exportToPdf(drawables, region, filename);
  }

  function exportWholeBoard() {
    setExportMenuOpen(false);
    const all = [
      ...notes.map(({ data }) => objectBounds("note", data)),
      ...shapes.map(({ data }) => objectBounds("shape", data)),
      ...texts.map(({ data }) => objectBounds("text", data)),
      ...frames.map(({ data }) => objectBounds("frame", data)),
      ...images.map(({ data }) => objectBounds("image", data)),
      ...resolveArrowsForExport().map(({ data }) => objectBounds("arrow", data)),
    ];
    if (all.length === 0) {
      window.alert("Board is empty — nothing to export.");
      return;
    }
    const margin = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of all) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const region: ExportRect = { x: minX - margin, y: minY - margin, w: maxX - minX + margin * 2, h: maxY - minY + margin * 2 };
    runExport(region, `${boardName || roomId}.pdf`);
  }

  function exportSelectedFrame() {
    setExportMenuOpen(false);
    if (!selection || selection.kind !== "frame") return;
    const f = frames.find((x) => x.id === selection.id);
    if (!f) return;
    runExport(objectBounds("frame", f.data), `${boardName || roomId}-frame.pdf`);
  }

  function startExportSelectArea() {
    setExportMenuOpen(false);
    setExportSelecting(true);
  }

  // Broadcast local cursor in world coords, throttled to one update per
  // animation frame so rapid mousemove doesn't flood awareness broadcasts.
  const cursorRaf = useRef(0);
  const broadcastCursor = useCallback((wx: number | null, wy: number | null) => {
    if (cursorRaf.current) return;
    cursorRaf.current = requestAnimationFrame(() => {
      cursorRaf.current = 0;
      providerRef.current?.awareness.setLocalStateField("cursor", wx === null ? null : { x: wx, y: wy });
    });
  }, []);

  function onViewportPointerDown(e: React.PointerEvent) {
    const w = screenToWorld(e.clientX, e.clientY);

    // F1b "Select area…" export: a self-contained marquee mode layered on
    // top of the normal tool handling (guarded first, returns early) rather
    // than threaded through the tool switch below — it isn't a `Tool`,
    // just a one-shot region pick.
    if (exportSelecting) {
      exportMarqueeRef.current = { sx: w.x, sy: w.y };
      setExportMarqueePreview({ x: w.x, y: w.y, w: 0, h: 0 });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "pan") {
      stopFollow();
      panRef.current = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
      setPanning(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "select") {
      setSelection(null);
      return;
    }
    if (tool === "note") {
      // preventDefault: without it, the browser's own mousedown-focus
      // handling fires after our JS (using the pre-creation hit-test
      // target, since the note didn't exist yet) and immediately blurs
      // the note body we just focused via the justCreated effect.
      e.preventDefault();
      const id = addNote(board, w.x - 86, w.y - 86, activeColor, "you");
      setSelection({ kind: "note", id });
      setJustCreated(id);
      setTool("select");
      return;
    }
    if (tool === "text") {
      e.preventDefault();
      const id = addText(board, w.x, w.y - 14);
      setSelection({ kind: "text", id });
      setJustCreated(id);
      setTool("select");
      return;
    }
    // rect / ellipse / diamond / frame / arrow: drag to draw
    drawRef.current = { tool, sx: w.x, sy: w.y };
    if (tool === "arrow") setArrowPreview({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
    else setDrawPreview({ x: w.x, y: w.y, w: 0, h: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onViewportPointerMove(e: React.PointerEvent) {
    const wp = screenToWorld(e.clientX, e.clientY);
    broadcastCursor(wp.x, wp.y);

    if (exportMarqueeRef.current) {
      const m = exportMarqueeRef.current;
      setExportMarqueePreview({
        x: Math.min(m.sx, wp.x),
        y: Math.min(m.sy, wp.y),
        w: Math.abs(wp.x - m.sx),
        h: Math.abs(wp.y - m.sy),
      });
      return;
    }

    if (anchorPendingRef.current) {
      const p = anchorPendingRef.current;
      const dist = Math.hypot(e.clientX - p.startClientX, e.clientY - p.startClientY);
      if (dist <= ANCHOR_CLICK_PX) return; // still just a pending click
      // Promoted past the click threshold: it's a connector drag now.
      anchorPendingRef.current = null;
      stopFollow();
      anchorDragRef.current = { x1: p.x, y1: p.y, fromId: p.shapeId, fromSide: p.side };
      setArrowPreview({ x1: p.x, y1: p.y, x2: wp.x, y2: wp.y });
    }
    if (anchorDragRef.current) {
      const a = anchorDragRef.current;
      setArrowPreview({ x1: a.x1, y1: a.y1, x2: wp.x, y2: wp.y });
      const target = findAttractTarget(wp.x, wp.y, a.fromId);
      setAttractTarget(target ? { id: target.id, side: resolveBinding(target.data, "auto", a.x1, a.y1).side } : null);
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.mx), y: p.vy + (e.clientY - p.my) }));
      return;
    }
    const d = drawRef.current;
    if (d) {
      const w = screenToWorld(e.clientX, e.clientY);
      if (d.tool === "arrow") {
        setArrowPreview({ x1: d.sx, y1: d.sy, x2: w.x, y2: w.y });
        const target = findAttractTarget(w.x, w.y);
        setAttractTarget(target ? { id: target.id, side: resolveBinding(target.data, "auto", d.sx, d.sy).side } : null);
      } else {
        setDrawPreview({
          x: Math.min(d.sx, w.x),
          y: Math.min(d.sy, w.y),
          w: Math.abs(w.x - d.sx),
          h: Math.abs(w.y - d.sy),
        });
      }
    }
  }

  function onViewportPointerUp(e: React.PointerEvent) {
    if (exportMarqueeRef.current) {
      const m = exportMarqueeRef.current;
      const w = screenToWorld(e.clientX, e.clientY);
      exportMarqueeRef.current = null;
      setExportMarqueePreview(null);
      setExportSelecting(false);
      const region: ExportRect = {
        x: Math.min(m.sx, w.x),
        y: Math.min(m.sy, w.y),
        w: Math.abs(w.x - m.sx),
        h: Math.abs(w.y - m.sy),
      };
      if (region.w >= 8 && region.h >= 8) runExport(region, `${boardName || roomId}-selection.pdf`);
      return;
    }
    if (anchorPendingRef.current) {
      // Pointer never moved past the click threshold: quick-create instead
      // of the connector-drag flow below (Epic C).
      const p = anchorPendingRef.current;
      anchorPendingRef.current = null;
      quickCreateFromAnchor(p.shapeId, p.side);
      return;
    }
    if (anchorDragRef.current) {
      const a = anchorDragRef.current;
      const w = screenToWorld(e.clientX, e.clientY);
      anchorDragRef.current = null;
      setArrowPreview(null);
      setAttractTarget(null);
      // Padded past the shape's exact bounds so a drop that's a few screen
      // pixels off the edge still snaps — a strict point-in-rect test made
      // this need pixel-perfect precision to trigger at all.
      const target = findAttractTarget(w.x, w.y, a.fromId);
      let ex = w.x, ey = w.y;
      let toBinding: Binding | undefined;
      if (target) {
        const r = resolveBinding(target.data, "auto", a.x1, a.y1);
        ex = r.point.x;
        ey = r.point.y;
        toBinding = { id: target.id, side: "auto" };
      }
      const len = Math.hypot(ex - a.x1, ey - a.y1);
      if (len >= 12) {
        const fromBinding: Binding | undefined = a.fromId && a.fromSide ? { id: a.fromId, side: a.fromSide } : undefined;
        addArrow(board, a.x1, a.y1, ex, ey, { from: fromBinding, to: toBinding });
      }
      return;
    }
    if (panRef.current) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    const d = drawRef.current;
    if (d) {
      const w = screenToWorld(e.clientX, e.clientY);
      drawRef.current = null;
      if (d.tool === "arrow") {
        setArrowPreview(null);
        setAttractTarget(null);
        const len = Math.hypot(w.x - d.sx, w.y - d.sy);
        if (len >= 12) {
          const startTarget = findAttractTarget(d.sx, d.sy);
          const endTarget = findAttractTarget(w.x, w.y, startTarget?.id);
          let sx = d.sx, sy = d.sy, ex = w.x, ey = w.y;
          let fromBinding: Binding | undefined;
          let toBinding: Binding | undefined;
          if (startTarget) {
            const r = resolveBinding(startTarget.data, "auto", w.x, w.y);
            sx = r.point.x;
            sy = r.point.y;
            fromBinding = { id: startTarget.id, side: "auto" };
          }
          if (endTarget) {
            const r = resolveBinding(endTarget.data, "auto", sx, sy);
            ex = r.point.x;
            ey = r.point.y;
            toBinding = { id: endTarget.id, side: "auto" };
          }
          addArrow(board, sx, sy, ex, ey, { from: fromBinding, to: toBinding });
        }
      } else {
        setDrawPreview(null);
        const x = Math.min(d.sx, w.x);
        const y = Math.min(d.sy, w.y);
        let ww = Math.abs(w.x - d.sx);
        let hh = Math.abs(w.y - d.sy);
        const tap = ww < 16 || hh < 16;
        if (tap) {
          ww = d.tool === "frame" ? 420 : 150;
          hh = d.tool === "frame" ? 300 : 100;
        }
        if (d.tool === "frame") {
          addFrame(board, x, y, ww, hh, "FRAME");
        } else {
          const id = addShape(board, d.tool as ShapeKind, x, y, ww, hh, activeColor);
          setSelection({ kind: "shape", id });
          setJustCreated(id);
        }
      }
      setTool("select");
    }
  }

  function zoomAt(px: number, py: number, factor: number) {
    stopFollow();
    setView((v) => {
      const ns = Math.min(3, Math.max(0.2, v.s * factor));
      const k = ns / v.s;
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, s: ns };
    });
  }

  // React attaches the JSX `onWheel` handler as a passive listener on the
  // root, so calling `e.preventDefault()` inside it throws "Unable to
  // preventDefault inside passive event listener invocation" instead of
  // actually blocking the page scroll/zoom. Attach natively with
  // `{ passive: false }` instead. zoomAtRef sidesteps re-attaching the
  // listener (and its addEventListener/removeEventListener churn) every
  // render just because zoomAt is a fresh closure each time.
  const zoomAtRef = useRef(zoomAt);
  useEffect(() => {
    zoomAtRef.current = zoomAt;
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomAtRef.current(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- keyboard ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+Z/Y is handled before the "focused text field" guard below and
      // always calls preventDefault. This app has no rich-text framework, so
      // there's no meaningful native undo to defer to — and deferring to it
      // is actively harmful: a contentEditable can end up focused just from
      // dragging (see FrameItem's onPointerDown comment), and the browser's
      // native contentEditable undo isn't scoped the way you'd expect — it
      // was observed clearing an unrelated note's text instead of no-op'ing.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) board.undoManager.redo();
        else board.undoManager.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        board.undoManager.redo();
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || active.tagName === "INPUT")) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection(selection);
        return;
      }
      if (e.key === "Escape") {
        setSelection(null);
        setExportSelecting(false);
        return;
      }
      const map: Record<string, Tool> = {
        v: "select", h: "pan", n: "note", t: "text",
        r: "rect", o: "ellipse", d: "diamond", a: "arrow", f: "frame", i: "image",
      };
      const k = e.key.toLowerCase();
      if (map[k]) setTool(map[k]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [board, selection, deleteSelection]);

  const viewportClass = [
    styles.viewport,
    tool === "pan" ? styles.toolPan : "",
    panning ? styles.panning : "",
    ["rect", "ellipse", "diamond", "frame", "arrow"].includes(tool) || exportSelecting ? styles.toolDraw : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={viewportRef}
      className={viewportClass}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
      onPointerLeave={() => providerRef.current?.awareness.setLocalStateField("cursor", null)}
    >
      <div className={styles.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        <svg className={styles.svgLayer}>
          <ArrowheadDefs />
          {arrows.map(({ id, data }) => (
            <ArrowItem
              key={id}
              board={board}
              id={id}
              data={data}
              view={view}
              tool={tool}
              selected={selection?.kind === "arrow" && selection.id === id}
              onSelect={setSelection}
              shapesById={shapesById}
              onDelete={deleteSelection}
            />
          ))}
          {attractTarget &&
            (() => {
              const sd = shapesById.get(attractTarget.id);
              if (!sd) return null;
              return <AttractAnchors data={sd} activeSide={attractTarget.side} />;
            })()}
          {arrowPreview && (
            <line
              x1={arrowPreview.x1}
              y1={arrowPreview.y1}
              x2={arrowPreview.x2}
              y2={arrowPreview.y2}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {frames.map(({ id, data }) => (
          <FrameItem
            key={id}
            board={board}
            id={id}
            data={data}
            view={view}
            selected={selection?.kind === "frame" && selection.id === id}
            onSelect={setSelection}
            registerBody={registerBody}
            allNotes={notes}
            allShapes={shapes}
            allTexts={texts}
            allArrows={arrows}
            allImages={images}
            onDelete={deleteSelection}
          />
        ))}

        {images.map(({ id, data }) => (
          <ImageItem
            key={id}
            board={board}
            id={id}
            data={data}
            view={view}
            tool={tool}
            selected={selection?.kind === "image" && selection.id === id}
            onSelect={setSelection}
          />
        ))}

        {shapes.map(({ id, data }) => (
          <ShapeItem
            key={id}
            board={board}
            id={id}
            data={data}
            view={view}
            tool={tool}
            selected={selection?.kind === "shape" && selection.id === id}
            onSelect={setSelection}
            registerBody={registerBody}
            onAnchorPointerDown={onAnchorPointerDown}
            onDelete={deleteSelection}
          />
        ))}

        {texts.map(({ id, data }) => (
          <TextItem
            key={id}
            board={board}
            id={id}
            data={data}
            view={view}
            tool={tool}
            selected={selection?.kind === "text" && selection.id === id}
            onSelect={setSelection}
            registerBody={registerBody}
            onDelete={deleteSelection}
          />
        ))}

        {notes.map(({ id, data }) => (
          <NoteItem
            key={id}
            board={board}
            id={id}
            data={data}
            view={view}
            tool={tool}
            selected={selection?.kind === "note" && selection.id === id}
            onSelect={setSelection}
            registerBody={registerBody}
            onDelete={deleteSelection}
          />
        ))}

        {drawPreview && (
          <div
            style={{
              position: "absolute",
              left: drawPreview.x,
              top: drawPreview.y,
              width: drawPreview.w,
              height: drawPreview.h,
              border: "2px dashed var(--accent)",
              borderRadius: tool === "frame" ? 8 : 6,
              pointerEvents: "none",
            }}
          />
        )}

        {exportMarqueePreview && (
          <div
            style={{
              position: "absolute",
              left: exportMarqueePreview.x,
              top: exportMarqueePreview.y,
              width: exportMarqueePreview.w,
              height: exportMarqueePreview.h,
              border: "2px dashed var(--accent)",
              background: "var(--accent-soft)",
              pointerEvents: "none",
            }}
          />
        )}

        {remotePeers.map(
          (p) =>
            p.cursor && (
              <div key={p.clientId} className={styles.cursor} style={{ transform: `translate(${p.cursor.x}px, ${p.cursor.y}px)` }}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill={p.color} d="M5 3l14 7-6 1.6L9.4 18 5 3z" />
                </svg>
                <div className={styles.cursorName} style={{ background: p.color }}>
                  {p.name}
                </div>
              </div>
            ),
        )}
      </div>

      <div className={topbarStyles.topbar}>
        <Link href="/dashboard" className={topbarStyles.tbGroup} title="My boards" onPointerDown={(e) => e.stopPropagation()}>
          <span className={topbarStyles.logo}>C</span>
        </Link>

        <div className={`${topbarStyles.tbGroup} ${topbarStyles.brand}`} onPointerDown={(e) => e.stopPropagation()}>
          <input
            className={topbarStyles.nameInput}
            value={boardName}
            placeholder="Untitled board"
            maxLength={60}
            spellCheck={false}
            onChange={(e) => renameBoard(e.target.value)}
          />
          <small>{roomId.toUpperCase()}</small>
        </div>

        <div style={{ position: "relative" }} onPointerDown={(e) => e.stopPropagation()}>
          <button
            className={topbarStyles.shareBtn}
            style={{ background: "var(--ink-soft)" }}
            onClick={() => setExportMenuOpen((o) => !o)}
            title="Export part of the board as a PDF"
          >
            Export
          </button>
          {exportMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: 180,
                background: "var(--panel)",
                border: "1px solid var(--panel-border)",
                boxShadow: "var(--panel-shadow)",
                borderRadius: "var(--r-panel)",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                zIndex: 1100,
                // .topbar sets `pointer-events: none` (so clicks pass through its
                // empty chrome to the canvas below) and only re-enables it on
                // specific classed elements like .shareBtn/.tbGroup — this menu
                // is a plain unclassed div, so without this it silently inherits
                // `none` and every click on "Whole board"/"This frame"/"Select
                // area" falls through to the canvas untouched.
                pointerEvents: "auto",
              }}
            >
              <button onClick={exportWholeBoard} style={EXPORT_MENU_ITEM_STYLE}>
                Whole board
              </button>
              <button
                onClick={exportSelectedFrame}
                disabled={selection?.kind !== "frame"}
                style={{ ...EXPORT_MENU_ITEM_STYLE, opacity: selection?.kind === "frame" ? 1 : 0.45 }}
                title={selection?.kind === "frame" ? undefined : "Select a frame first"}
              >
                This frame
              </button>
              <button onClick={startExportSelectArea} style={EXPORT_MENU_ITEM_STYLE}>
                Select area…
              </button>
            </div>
          )}
        </div>

        <button
          className={topbarStyles.shareBtn}
          onClick={shareBoard}
          onPointerDown={(e) => e.stopPropagation()}
          title="Copy this board's link"
        >
          {linkCopied ? "Copied!" : "Share"}
        </button>

        <ThemeToggle />

        <div className={`${topbarStyles.tbGroup} ${topbarStyles.presence}`}>
          <span
            className={topbarStyles.live}
            title={connState === "connected" ? "Synced with the room" : connState === "connecting" ? "Connecting…" : "Disconnected"}
          >
            <span
              className={topbarStyles.dot}
              style={connState !== "connected" ? { background: "var(--warn)", animation: "none" } : undefined}
            />
            {connState === "connected" ? "Live" : connState === "connecting" ? "Connecting…" : "Offline"}
          </span>
          <div className={topbarStyles.avatars}>
            <Link
              href="/profile"
              className={topbarStyles.avatar}
              style={{ background: color }}
              title={`${name} (you) — edit profile`}
            >
              {name[0]?.toUpperCase() ?? "?"}
            </Link>
            {remotePeers.map((p) => {
              const isFollowing = followingId === p.clientId;
              return (
                <button
                  key={p.clientId}
                  className={topbarStyles.avatar}
                  style={{
                    background: p.color,
                    cursor: "pointer",
                    border: isFollowing ? "2px solid var(--accent)" : undefined,
                    outline: isFollowing ? "2px solid var(--accent)" : undefined,
                    outlineOffset: isFollowing ? 1 : undefined,
                  }}
                  title={isFollowing ? `Following ${p.name} — click to stop` : `Follow ${p.name}`}
                  onClick={() => setFollowingId((cur) => (cur === p.clientId ? null : p.clientId))}
                >
                  {p.name[0]?.toUpperCase() ?? "?"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.toolbar} onPointerDown={(e) => e.stopPropagation()}>
        <ToolButton tool="select" current={tool} onClick={setTool} title="Select (V)">
          <path d="M5 3l14 7-6 1.6L9.4 18 5 3z" fill="currentColor" />
        </ToolButton>
        <ToolButton tool="pan" current={tool} onClick={setTool} title="Hand / pan (H)">
          <path
            d="M18 11V7a1.5 1.5 0 00-3 0v4V5.5a1.5 1.5 0 00-3 0V11V6.5a1.5 1.5 0 00-3 0V12l-1.7-2a1.5 1.5 0 00-2.3 1.9L8.5 18a5 5 0 004.2 2.3h1.8A4.5 4.5 0 0019 15.8V11z"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </ToolButton>
        <div className={styles.sep} />
        <ToolButton tool="note" current={tool} onClick={setTool} title="Sticky note (N)">
          <path d="M4 4h16v11l-5 5H4z" fill="none" stroke="currentColor" strokeWidth={2} />
          <path d="M20 15h-5v5" fill="none" stroke="currentColor" strokeWidth={2} />
        </ToolButton>
        <ToolButton tool="text" current={tool} onClick={setTool} title="Text (T)">
          <path d="M5 6V4h14v2M12 4v16M9 20h6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </ToolButton>
        <ToolButton tool="rect" current={tool} onClick={setTool} title="Rectangle (R)">
          <rect x={4} y={6} width={16} height={12} rx={2} fill="none" stroke="currentColor" strokeWidth={2} />
        </ToolButton>
        <ToolButton tool="ellipse" current={tool} onClick={setTool} title="Ellipse (O)">
          <ellipse cx={12} cy={12} rx={8.5} ry={6.5} fill="none" stroke="currentColor" strokeWidth={2} />
        </ToolButton>
        <ToolButton tool="diamond" current={tool} onClick={setTool} title="Diamond (D)">
          <path d="M12 3l8 9-8 9-8-9z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        </ToolButton>
        <ToolButton tool="arrow" current={tool} onClick={setTool} title="Connector (A)">
          <path d="M5 19L19 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <path d="M11 5h8v8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </ToolButton>
        <ToolButton tool="frame" current={tool} onClick={setTool} title="Frame (F)">
          <path d="M7 3v18M17 3v18M3 7h18M3 17h18" fill="none" stroke="currentColor" strokeWidth={2} />
        </ToolButton>
        <ToolButton
          tool="image"
          current={tool}
          onClick={setTool}
          title={isSignedIn ? "Insert image (I)" : "Sign in to add images"}
          dimmed={!isSignedIn}
        >
          <rect x={4} y={4} width={16} height={16} rx={2} fill="none" stroke="currentColor" strokeWidth={2} />
          <circle cx={9} cy={9.5} r={1.6} fill="currentColor" />
          <path d="M5 16l4.5-5 3.5 4 2-2.5L19 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file next time
            if (f) onImageFileSelected(f);
          }}
        />
        <div className={styles.sep} />
        <div className={styles.swatches}>
          {NOTE_COLORS.map((c, i) => (
            <button
              key={c.tag}
              className={`${styles.sw} ${activeColor === i ? styles.active : ""}`}
              style={{ background: c.bg }}
              title={c.tag}
              onClick={() => setActiveColor(i)}
            />
          ))}
        </div>
      </div>

      <div className={styles.zoom} onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.2)}>−</button>
        <div className={styles.zoomVal}>{Math.round(view.s * 100)}%</div>
        <button onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.2)}>+</button>
      </div>

      <div className={styles.hint}>
        <b>Click</b> select · <b>Double-click</b> edit text · <b>Drag</b> a tool to draw · <b>H</b> pan ·{" "}
        <b>Ctrl+Z</b> undo
      </div>
    </div>
  );
}

// A curved connector: bows away from the straight line by `data.curve` world
// units, perpendicular to the line. `curve` is a plain offset (not an angle),
// so it stays stable as the line's endpoints move. Drag the midpoint handle
// (shown only while selected) to set it.
// Floating control shown above a selected connector: routing mode (3-way),
// thickness (4 presets, unchanged from before — just relocated here per
// PLAN.md A4), and a start/end arrowhead style pair. Rendered via
// <foreignObject> so it can hold plain HTML controls inside the SVG layer.
//
// F2: this used to just live in world coordinates like every other object
// under `.world` (a prior comment here claimed that was already
// "screen-space" — it wasn't; PLAN.md's F2 section calls this out as one of
// two things the old plan got wrong). Now the inner <div> carries a
// counter-scale (same `src/lib/screen-space.ts` primitive as FontToolbar)
// so it's a constant on-screen size at any zoom.
//
// Two things specific to foreignObject, both reflected in the structure
// below:
// 1. The counter-scaled div's *painted* pixels grow well beyond its own
//    (unscaled) layout box at low zoom, and a foreignObject clips its
//    content to its `width`/`height` box by default. `overflow: visible`
//    on the foreignObject opts out of that, but foreignObject overflow
//    handling has historically been inconsistent across engines, so as a
//    second, belt-and-suspenders line of defense the box itself is also
//    grown to `CONNECTOR_TOOLBAR_WIDTH/HEIGHT_PX` converted to world units
//    (sized so it always maps back to that constant on-screen footprint
//    after `.world`'s own scale is applied) — big enough to contain the
//    scaled content either way.
// 2. An earlier version of this tried `display: flex` on the
//    <foreignObject> itself to bottom-center the toolbar div inside that
//    grown box. Don't do that — flexbox layout on a foreignObject isn't
//    reliably honored across engines (it's an SVG viewport-establishing
//    element, not dependably a CSS flex container), and when it's not
//    honored the div sits top-left of the (now much bigger) box instead of
//    bottom-center, at every zoom including 1. Plain block/absolute
//    positioning doesn't have that problem: a `position: relative` wrapper
//    filling the box, with the toolbar `position: absolute; left: 50%;
//    bottom: 0` inside it (`.connectorToolbar` in Canvas.module.css) plus
//    `centeredToolbarStyle()`'s `translateX(-50%) scale(1/zoom)`, is
//    ordinary CSS that every engine agrees on.
export function ConnectorToolbar({
  x,
  y,
  zoom,
  routing,
  strokeWidth,
  headStart,
  headEnd,
  onChange,
  onDelete,
}: {
  x: number;
  y: number;
  zoom: number;
  routing: Routing;
  strokeWidth: number;
  headStart: ArrowHead;
  headEnd: ArrowHead;
  onChange: (patch: Partial<ArrowData>) => void;
  onDelete?: () => void;
}) {
  const boxWidth = screenPxToWorld(CONNECTOR_TOOLBAR_WIDTH_PX, zoom);
  const boxHeight = screenPxToWorld(CONNECTOR_TOOLBAR_HEIGHT_PX, zoom);
  const gap = screenPxToWorld(CONNECTOR_TOOLBAR_GAP_PX, zoom);
  return (
    <foreignObject x={x - boxWidth / 2} y={y - gap - boxHeight} width={boxWidth} height={boxHeight} style={{ overflow: "visible" }}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div
          className={styles.connectorToolbar}
          style={centeredToolbarStyle(zoom)}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className={styles.ctGroup}>
            {ROUTING_MODES.map((r) => (
              <button key={r} className={routing === r ? styles.ftActive : ""} title={r} onClick={() => onChange({ routing: r })}>
                {r === "straight" && (
                  <svg width={16} height={16} viewBox="0 0 24 24">
                    <path d="M4 20L20 4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" />
                  </svg>
                )}
                {r === "curved" && (
                  <svg width={16} height={16} viewBox="0 0 24 24">
                    <path d="M4 20Q4 4 20 4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" />
                  </svg>
                )}
                {r === "elbow" && (
                  <svg width={16} height={16} viewBox="0 0 24 24">
                    <path d="M4 20H14V4H20" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className={styles.ftSep} />
          <div className={styles.ctGroup}>
            {ARROW_STROKE_PRESETS.map((w) => (
              <button key={w} className={strokeWidth === w ? styles.ftActive : ""} title={`${w}px`} onClick={() => onChange({ strokeWidth: w })}>
                <svg width={18} height={16} viewBox="0 0 20 16">
                  <line x1={2} y1={8} x2={18} y2={8} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
          <div className={styles.ftSep} />
          <div className={styles.ctGroup}>
            <span className={styles.ctLabel}>Start</span>
            <select value={headStart} onChange={(e) => onChange({ headStart: e.target.value as ArrowHead })}>
              {ARROW_HEAD_STYLES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.ctGroup}>
            <span className={styles.ctLabel}>End</span>
            <select value={headEnd} onChange={(e) => onChange({ headEnd: e.target.value as ArrowHead })}>
              {ARROW_HEAD_STYLES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
        {onDelete && (
          <div className={styles.ctDeleteGroup}>
            <button className={styles.deleteBtn} title="Delete connector" onClick={onDelete}>
              <svg width={15} height={15} viewBox="0 0 24 24">
                <path
                  d="M5 6h14M9 6V4h6v2M7 6l1 14h8l1-14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </foreignObject>
  );
}

function ArrowItem({
  board,
  id,
  data,
  view,
  tool,
  selected,
  onSelect,
  shapesById,
  onDelete,
}: {
  board: BoardDoc;
  id: string;
  data: ArrowData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
  shapesById: Map<string, ShapeData>;
  onDelete: (sel: Selection) => void;
}) {
  type DragMode = "move" | "p1" | "p2" | "curve";
  const dragRef = useRef<{
    mode: DragMode;
    sx: number;
    sy: number;
    ox1: number;
    oy1: number;
    ox2: number;
    oy2: number;
    oc: number;
    moved: boolean;
  } | null>(null);
  const [hover, setHover] = useState<{ id: string; side: Side } | null>(null);

  // Epic B: resolve bound endpoints from the live shape data instead of the
  // raw x1/y1/x2/y2 fields. Those raw fields are kept as a pure fallback —
  // written continuously while an endpoint is dragged, read only when that
  // endpoint has no binding (or the bound shape no longer exists).
  const boundA = data.from ? shapesById.get(data.from.id) : undefined;
  const boundB = data.to ? shapesById.get(data.to.id) : undefined;
  const resolvedA = boundA && data.from ? resolveBinding(boundA, data.from.side, data.x2, data.y2) : null;
  const resolvedB = boundB && data.to
    ? resolveBinding(boundB, data.to.side, resolvedA ? resolvedA.point.x : data.x1, resolvedA ? resolvedA.point.y : data.y1)
    : null;
  const x1 = resolvedA ? resolvedA.point.x : data.x1;
  const y1 = resolvedA ? resolvedA.point.y : data.y1;
  const x2 = resolvedB ? resolvedB.point.x : data.x2;
  const y2 = resolvedB ? resolvedB.point.y : data.y2;
  const sideA = resolvedA?.side;
  const sideB = resolvedB?.side;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const curve = data.curve ?? 0;
  const curveCx = (x1 + x2) / 2 + nx * curve;
  const curveCy = (y1 + y2) / 2 + ny * curve;
  const strokeWidth = data.strokeWidth ?? ARROW_STROKE_DEFAULT;
  const headStart = data.headStart ?? "none";
  const headEnd = data.headEnd ?? "arrow";
  const routing: Routing = data.routing ?? (curve !== 0 ? "curved" : "straight");

  let pathD: string;
  let midX: number;
  let midY: number;
  if (routing === "elbow") {
    const pts = elbowPoints({ x: x1, y: y1 }, { x: x2, y: y2 }, sideA, sideB);
    pathD = roundedPath(pts);
    const mid = elbowMidpoint(pts);
    midX = mid.x;
    midY = mid.y;
  } else if (routing === "curved") {
    pathD = `M ${x1} ${y1} Q ${curveCx} ${curveCy} ${x2} ${y2}`;
    midX = curveCx;
    midY = curveCy;
  } else {
    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
    midX = (x1 + x2) / 2;
    midY = (y1 + y2) / 2;
  }

  function findHoverTarget(px: number, py: number) {
    const pad = ARROW_SNAP_PAD_PX / view.s;
    for (const [sid, sd] of shapesById) {
      if (px >= sd.x - pad && px <= sd.x + sd.w + pad && py >= sd.y - pad && py <= sd.y + sd.h + pad) {
        return { id: sid, side: resolveBinding(sd, "auto", px, py).side };
      }
    }
    return null;
  }

  function beginDrag(mode: DragMode) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = { mode, sx: e.clientX, sy: e.clientY, ox1: x1, oy1: y1, ox2: x2, oy2: y2, oc: curve, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function onDragMove(e: React.PointerEvent) {
    const s = dragRef.current;
    if (!s) return;
    const ddx = (e.clientX - s.sx) / view.s;
    const ddy = (e.clientY - s.sy) / view.s;
    const wasIdle = !s.moved;
    if (Math.abs(ddx) + Math.abs(ddy) > 2) s.moved = true;
    if (!s.moved) return;
    // The instant a bound endpoint starts actually moving (not just a
    // click), drop its binding so the line follows the cursor immediately;
    // it re-binds on release if dropped near a shape (see onDragUp).
    if (wasIdle) {
      if (s.mode === "p1" && data.from) updateFields(board.doc, board.arrows, id, { from: undefined });
      if (s.mode === "p2" && data.to) updateFields(board.doc, board.arrows, id, { to: undefined });
    }
    if (s.mode === "move") {
      // Dragging the whole line only makes sense when neither end is
      // bound — a bound endpoint is driven by its shape, so a line with
      // any binding doesn't translate as a unit.
      if (!boundA && !boundB) {
        updateFields(board.doc, board.arrows, id, { x1: s.ox1 + ddx, y1: s.oy1 + ddy, x2: s.ox2 + ddx, y2: s.oy2 + ddy });
      }
    } else if (s.mode === "p1") {
      const wx = s.ox1 + ddx, wy = s.oy1 + ddy;
      updateFields(board.doc, board.arrows, id, { x1: wx, y1: wy });
      setHover(findHoverTarget(wx, wy));
    } else if (s.mode === "p2") {
      const wx = s.ox2 + ddx, wy = s.oy2 + ddy;
      updateFields(board.doc, board.arrows, id, { x2: wx, y2: wy });
      setHover(findHoverTarget(wx, wy));
    } else {
      const delta = ddx * nx + ddy * ny; // scalar drag projected onto the normal
      updateFields(board.doc, board.arrows, id, { curve: s.oc + delta });
    }
  }
  function onDragUp(e: React.PointerEvent) {
    const s = dragRef.current;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!s) return;
    if (!s.moved) {
      onSelect({ kind: "arrow", id });
      return;
    }
    if (s.mode === "p1" || s.mode === "p2") {
      if (hover) {
        updateFields(board.doc, board.arrows, id, { [s.mode === "p1" ? "from" : "to"]: { id: hover.id, side: "auto" } as Binding });
      }
      setHover(null);
    }
  }

  function onPathDown(e: React.PointerEvent) {
    if (tool !== "select") return;
    // A plain click (no movement) selects; a drag moves the whole line —
    // same click-vs-drag split as useSimpleDrag elsewhere in this file.
    beginDrag("move")(e);
  }

  return (
    <>
      <path
        d={pathD}
        fill="none"
        stroke="var(--stroke-ink)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerStart={headStart !== "none" ? `url(#${arrowheadMarkerId(headStart)})` : undefined}
        markerEnd={headEnd !== "none" ? `url(#${arrowheadMarkerId(headEnd)})` : undefined}
        className={`${styles.arrow} ${selected ? styles.selected : ""}`}
        onPointerDown={onPathDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      />
      {hover &&
        (() => {
          const sd = shapesById.get(hover.id);
          return sd ? <AttractAnchors data={sd} activeSide={hover.side} /> : null;
        })()}
      {selected && (
        <>
          {routing === "curved" && (
            <circle
              cx={curveCx}
              cy={curveCy}
              r={6}
              className={styles.curveHandle}
              onPointerDown={beginDrag("curve")}
              onPointerMove={onDragMove}
              onPointerUp={onDragUp}
            />
          )}
          <circle cx={x1} cy={y1} r={6} className={styles.endHandle} onPointerDown={beginDrag("p1")} onPointerMove={onDragMove} onPointerUp={onDragUp} />
          <circle cx={x2} cy={y2} r={6} className={styles.endHandle} onPointerDown={beginDrag("p2")} onPointerMove={onDragMove} onPointerUp={onDragUp} />
          <ConnectorToolbar
            x={midX}
            y={midY}
            zoom={view.s}
            routing={routing}
            strokeWidth={strokeWidth}
            headStart={headStart}
            headEnd={headEnd}
            onChange={(patch) => updateFields(board.doc, board.arrows, id, patch)}
            onDelete={() => onDelete({ kind: "arrow", id })}
          />
        </>
      )}
    </>
  );
}

function ToolButton({
  tool,
  current,
  onClick,
  title,
  dimmed,
  children,
}: {
  tool: Tool;
  current: Tool;
  onClick: (t: Tool) => void;
  title: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`${styles.tool} ${current === tool ? styles.active : ""} ${dimmed ? styles.toolDimmed : ""}`}
      title={title}
      onClick={() => onClick(tool)}
    >
      <svg viewBox="0 0 24 24">{children}</svg>
    </button>
  );
}

function NoteItem({
  board,
  id,
  data,
  view,
  tool,
  selected,
  onSelect,
  registerBody,
  onDelete,
}: {
  board: BoardDoc;
  id: string;
  data: NoteData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
  registerBody: (id: string, el: HTMLElement | null) => void;
  onDelete: (sel: Selection) => void;
}) {
  const bodyRef = useRef<HTMLElement | null>(null);
  const drag = useSimpleDrag(board, board.notes, "note", id, data.x, data.y, view, tool, onSelect, bodyRef);
  const c = NOTE_COLORS[data.color] ?? NOTE_COLORS[0];
  const fontSize = data.fontSize ?? 15;
  return (
    <>
      <div
        className={`${styles.note} ${selected ? styles.selected : ""}`}
        style={{ left: data.x, top: data.y, background: c.bg }}
        {...drag}
      >
        <div
          ref={(el) => {
            registerBody(id, el);
            bodyRef.current = el;
          }}
          className={styles.noteBody}
          style={{
            fontSize,
            fontFamily: FONT_STACK[data.fontFamily ?? "ui"],
            textAlign: data.textAlign ?? "left",
            ...bodyStyleFields(data, "fixed"),
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateFields(board.doc, board.notes, id, { body: e.currentTarget.textContent ?? "" })}
          onKeyDown={(e) => handleStyleKeyDown(e, data, (patch) => updateFields(board.doc, board.notes, id, patch))}
        >
          {data.body}
        </div>
        <div className={styles.tag}>
          {data.author} · {c.tag}
        </div>
      </div>
      {selected && (
        <ElementToolbar
          x={data.x}
          y={data.y}
          zoom={view.s}
          fontSize={fontSize}
          fontFamily={data.fontFamily ?? "ui"}
          textAlign={data.textAlign ?? "left"}
          kind="note"
          color={data.color}
          bold={data.bold}
          italic={data.italic}
          underline={data.underline}
          textColor={data.textColor}
          onChange={(patch) => updateFields(board.doc, board.notes, id, patch)}
          onDelete={() => onDelete({ kind: "note", id })}
        />
      )}
    </>
  );
}

const SHAPE_PAD_Y = 20; // .shape padding: 10px top + 10px bottom (Canvas.module.css)

function ShapeItem({
  board,
  id,
  data,
  view,
  tool,
  selected,
  onSelect,
  registerBody,
  onAnchorPointerDown,
  onDelete,
}: {
  board: BoardDoc;
  id: string;
  data: ShapeData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
  registerBody: (id: string, el: HTMLElement | null) => void;
  onAnchorPointerDown: (shapeId: string, side: Side, x: number, y: number, clientX: number, clientY: number) => void;
  onDelete: (sel: Selection) => void;
}) {
  const bodyRef = useRef<HTMLElement | null>(null);
  const drag = useSimpleDrag(board, board.shapes, "shape", id, data.x, data.y, view, tool, onSelect, bodyRef);
  const c = NOTE_COLORS[data.color] ?? NOTE_COLORS[0];
  const fontSize = data.fontSize ?? 14;
  const strokeWidth = data.strokeWidth ?? 2.5;
  const filled = data.filled !== false;
  const [hoverSide, setHoverSide] = useState<Side | null>(null);

  // Auto-grow: whenever the (unrotated) text content needs more height than
  // the shape currently has, grow the shape to fit. Only grows — a manual
  // resize that leaves room for the text is left alone, matching Miro.
  // `strokeWidthRef` folds the border into the needed-height calc (F3: the
  // border is now user-adjustable up to 6.5px, not a fixed 2.5px) so a
  // thick border narrowing the content box can't create a grow loop.
  const hRef = useRef(data.h);
  const strokeWidthRef = useRef(strokeWidth);
  useEffect(() => {
    hRef.current = data.h;
  }, [data.h]);
  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const needed = el.scrollHeight + SHAPE_PAD_Y + strokeWidthRef.current * 2;
      if (needed > hRef.current) updateFields(board.doc, board.shapes, id, { h: needed });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [board, id]);

  const anchors: { side: Side; x: number; y: number }[] = [
    { side: "n", x: data.x + data.w / 2, y: data.y },
    { side: "e", x: data.x + data.w, y: data.y + data.h / 2 },
    { side: "s", x: data.x + data.w / 2, y: data.y + data.h },
    { side: "w", x: data.x, y: data.y + data.h / 2 },
  ];

  // Epic C ghost preview: where a quick-create click on `hoverSide` would
  // place the new shape — same offset PLAN.md specifies (shape extent + a
  // gap), no collision stepping (that's a create-time concern, not worth
  // previewing).
  const ghost = (() => {
    if (!hoverSide) return null;
    let gx = data.x, gy = data.y;
    if (hoverSide === "e") gx += data.w + QUICK_CREATE_GAP;
    else if (hoverSide === "w") gx -= data.w + QUICK_CREATE_GAP;
    else if (hoverSide === "s") gy += data.h + QUICK_CREATE_GAP;
    else gy -= data.h + QUICK_CREATE_GAP;
    return { x: gx, y: gy };
  })();

  return (
    <>
      {ghost && (
        <div
          className={styles.anchorGhost}
          style={{ left: ghost.x, top: ghost.y, width: data.w, height: data.h, borderRadius: data.kind === "ellipse" ? "50%" : 8 }}
        />
      )}
      <div
        className={`${styles.shape} ${styles[data.kind]} ${selected ? styles.selected : ""}`}
        // F2: `--zoom-inv` feeds the .anchor/.a-* hover-dot counter-scale in
        // Canvas.module.css, so they stay a constant, touch-sized 14px on
        // screen instead of shrinking with zoom. F3 adds borderWidth/fill.
        style={
          {
            left: data.x,
            top: data.y,
            width: data.w,
            height: data.h,
            borderColor: c.bg,
            borderWidth: strokeWidth,
            background: filled ? `${c.bg}2e` : "transparent",
            "--zoom-inv": zoomInv(view.s),
          } as ZoomVarStyle
        }
        {...drag}
      >
        <div
          ref={(el) => {
            registerBody(id, el);
            bodyRef.current = el;
          }}
          className={styles.shapeBody}
          style={{
            fontSize,
            fontFamily: FONT_STACK[data.fontFamily ?? "ui"],
            textAlign: data.textAlign ?? "center",
            ...bodyStyleFields(data),
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateFields(board.doc, board.shapes, id, { body: e.currentTarget.textContent ?? "" })}
          onKeyDown={(e) => handleStyleKeyDown(e, data, (patch) => updateFields(board.doc, board.shapes, id, patch))}
        >
          {data.body}
        </div>
        {tool === "select" &&
          anchors.map((a) => (
            <div
              key={a.side}
              className={`${styles.anchor} ${styles["a-" + a.side]}`}
              onPointerEnter={() => setHoverSide(a.side)}
              onPointerLeave={() => setHoverSide((s) => (s === a.side ? null : s))}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                onAnchorPointerDown(id, a.side, a.x, a.y, e.clientX, e.clientY);
              }}
              onPointerUp={() => setHoverSide(null)}
            >
              <span className={styles.anchorPlus}>+</span>
            </div>
          ))}
      </div>
      {selected && (
        <>
          <ResizeHandles
            x={data.x}
            y={data.y}
            w={data.w}
            h={data.h}
            view={view}
            minW={40}
            minH={30}
            onResize={(n) => updateFields(board.doc, board.shapes, id, n)}
          />
          <ElementToolbar
            x={data.x}
            y={data.y}
            zoom={view.s}
            fontSize={fontSize}
            fontFamily={data.fontFamily ?? "ui"}
            textAlign={data.textAlign ?? "center"}
            kind="shape"
            color={data.color}
            strokeWidth={strokeWidth}
            filled={filled}
            bold={data.bold}
            italic={data.italic}
            underline={data.underline}
            textColor={data.textColor}
            onChange={(patch) => updateFields(board.doc, board.shapes, id, patch)}
            onDelete={() => onDelete({ kind: "shape", id })}
          />
        </>
      )}
    </>
  );
}

function TextItem({
  board,
  id,
  data,
  view,
  tool,
  selected,
  onSelect,
  registerBody,
  onDelete,
}: {
  board: BoardDoc;
  id: string;
  data: TextData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
  registerBody: (id: string, el: HTMLElement | null) => void;
  onDelete: (sel: Selection) => void;
}) {
  const bodyRef = useRef<HTMLElement | null>(null);
  const drag = useSimpleDrag(board, board.texts, "text", id, data.x, data.y, view, tool, onSelect, bodyRef);
  const fontSize = data.fontSize ?? 19;
  return (
    <>
      <div className={`${styles.textEl} ${selected ? styles.selected : ""}`} style={{ left: data.x, top: data.y }} {...drag}>
        <div
          ref={(el) => {
            registerBody(id, el);
            bodyRef.current = el;
          }}
          className={styles.textBody}
          style={{
            fontSize,
            fontFamily: FONT_STACK[data.fontFamily ?? "ui"],
            textAlign: data.textAlign ?? "left",
            ...bodyStyleFields(data),
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => updateFields(board.doc, board.texts, id, { body: e.currentTarget.textContent ?? "" })}
          onKeyDown={(e) => handleStyleKeyDown(e, data, (patch) => updateFields(board.doc, board.texts, id, patch))}
        >
          {data.body}
        </div>
      </div>
      {selected && (
        <ElementToolbar
          x={data.x}
          y={data.y}
          zoom={view.s}
          fontSize={fontSize}
          fontFamily={data.fontFamily ?? "ui"}
          textAlign={data.textAlign ?? "left"}
          kind="text"
          bold={data.bold}
          italic={data.italic}
          underline={data.underline}
          textColor={data.textColor}
          onChange={(patch) => updateFields(board.doc, board.texts, id, patch)}
          onDelete={() => onDelete({ kind: "text", id })}
        />
      )}
    </>
  );
}

// F1a: an uploaded image. Drag/select reuses `useSimpleDrag` like every
// other free-standing object; resize is aspect-ratio-locked via
// aspect-resize.ts (a squashed photo reads as broken in a way a squashed
// rect does not — PLAN.md), which is why this doesn't reuse the shared
// `ResizeHandles` component (that one resizes each axis independently on
// purpose, for shapes/frames). The four corner handles below reuse the same
// `.resizeHandle`/`.rh-*` CSS classes as `ResizeHandles` purely for a
// consistent look — no shared component code, so no shared-file risk with
// the other agents also touching ResizeHandles/FontToolbar in this batch.
function ImageItem({
  board,
  id,
  data,
  view,
  tool,
  selected,
  onSelect,
}: {
  board: BoardDoc;
  id: string;
  data: ImageData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  // useSimpleDrag's double-click branch focuses this ref — unused here
  // since an image has no editable body, so it stays null and the
  // `?.focus()` inside useSimpleDrag is just a no-op.
  const bodyRef = useRef<HTMLElement | null>(null);
  const drag = useSimpleDrag(board, board.images, "image", id, data.x, data.y, view, tool, onSelect, bodyRef);

  const aspect = data.naturalW > 0 && data.naturalH > 0 ? data.naturalW / data.naturalH : data.w / (data.h || 1) || 1;
  const resizeDragRef = useRef<{
    corner: Corner;
    sx: number;
    sy: number;
    start: { x: number; y: number; w: number; h: number };
  } | null>(null);

  function startResize(corner: Corner) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeDragRef.current = { corner, sx: e.clientX, sy: e.clientY, start: { x: data.x, y: data.y, w: data.w, h: data.h } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function onResizeMove(e: React.PointerEvent) {
    const s = resizeDragRef.current;
    if (!s) return;
    const dx = (e.clientX - s.sx) / view.s;
    const dy = (e.clientY - s.sy) / view.s;
    const next = aspectResize(s.corner, s.start, dx, dy, aspect, 40);
    updateFields(board.doc, board.images, id, { x: next.x, y: next.y, w: next.w, h: next.h });
  }
  function onResizeUp(e: React.PointerEvent) {
    resizeDragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const corners: Corner[] = ["nw", "ne", "sw", "se"];

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: data.x,
          top: data.y,
          width: data.w,
          height: data.h,
          cursor: "grab",
          outline: selected ? "2px solid var(--accent)" : "none",
          outlineOffset: 2,
          borderRadius: 4,
          overflow: "hidden",
        }}
        {...drag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Supabase Storage URLs, not build-time-known assets next/image can optimize */}
        <img
          src={data.url}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", display: "block" }}
        />
      </div>
      {selected && (
        <div style={{ position: "absolute", left: data.x, top: data.y, width: data.w, height: data.h, pointerEvents: "none" }}>
          {corners.map((c) => (
            <div
              key={c}
              className={`${styles.resizeHandle} ${styles["rh-" + c]}`}
              onPointerDown={startResize(c)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface FrameMember {
  container: NoteKind;
  id: string;
  x: number;
  y: number;
}

// F5: the frame's "×" is today the only on-canvas delete affordance
// (everything else requires the Backspace key, which doesn't exist on a
// phone). PLAN.md's F4 generalizes this to every selected object; this is
// intentionally left small (a style + a click handler) so that lift is just
// "call it from more places," not a rewrite — F4 owns the generalization,
// not this pass.
function DeleteButton({ zoom, onDelete }: { zoom: number; onDelete: () => void }) {
  return (
    <button
      className={styles.del}
      style={counterScale(zoom, "bottom-right")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onDelete}
    >
      ×
    </button>
  );
}

export function FrameItem({
  board,
  id,
  data,
  view,
  selected,
  onSelect,
  registerBody,
  allNotes,
  allShapes,
  allTexts,
  allArrows,
  allImages,
  onDelete,
}: {
  board: BoardDoc;
  id: string;
  data: FrameData;
  view: ViewState;
  selected: boolean;
  onSelect: (s: Selection) => void;
  registerBody: (id: string, el: HTMLElement | null) => void;
  allNotes: { id: string; data: NoteData }[];
  allShapes: { id: string; data: ShapeData }[];
  allTexts: { id: string; data: TextData }[];
  allArrows: { id: string; data: ArrowData }[];
  allImages: { id: string; data: ImageData }[];
  onDelete: (sel: Selection) => void;
}) {
  const startRef = useRef<{
    mx: number;
    my: number;
    ox: number;
    oy: number;
    moved: boolean;
    members: FrameMember[];
    arrowMembers: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  } | null>(null);
  const lastDownRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);

  function inRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    // Without this, the browser's native mousedown-focus (and, since the
    // label is contentEditable, a text-selection drag) fires alongside our
    // own drag handling and leaves the label focused/selected afterward —
    // same class of bug as the note-creation focus fix above, and it has a
    // worse consequence here: a stray focused contentEditable makes the
    // global Ctrl+Z handler defer to the browser's native undo instead of
    // ours (see the keydown handler's comment).
    e.preventDefault();

    // Same synthetic double-click reconstruction as useSimpleDrag (see its
    // comment): preventDefault() above kills the native dblclick event, so
    // renaming the frame (double-click the label) is detected from pointerdown
    // timing/position instead.
    const now = performance.now();
    const last = lastDownRef.current;
    lastDownRef.current = { t: now, x: e.clientX, y: e.clientY };
    if (last && now - last.t < DBLCLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DBLCLICK_PX) {
      lastDownRef.current = null;
      bodyRef.current?.focus();
      return;
    }

    const rx = data.x;
    const ry = data.y;
    const rw = data.w;
    const rh = data.h;
    const members: FrameMember[] = [];
    // membership is spatial: whatever is inside the frame rect right now
    // rides along for this drag — the same rule Miro uses (no permanent
    // parent/child link).
    for (const { id: nid, data: nd } of allNotes) {
      if (inRect(nd.x + 86, nd.y + 86, rx, ry, rw, rh)) members.push({ container: board.notes, id: nid, x: nd.x, y: nd.y });
    }
    for (const { id: sid, data: sd } of allShapes) {
      if (inRect(sd.x + sd.w / 2, sd.y + sd.h / 2, rx, ry, rw, rh))
        members.push({ container: board.shapes, id: sid, x: sd.x, y: sd.y });
    }
    for (const { id: tid, data: td } of allTexts) {
      if (inRect(td.x, td.y, rx, ry, rw, rh)) members.push({ container: board.texts, id: tid, x: td.x, y: td.y });
    }
    for (const { id: iid, data: idata } of allImages) {
      if (inRect(idata.x + idata.w / 2, idata.y + idata.h / 2, rx, ry, rw, rh))
        members.push({ container: board.images, id: iid, x: idata.x, y: idata.y });
    }
    const arrowMembers: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const { id: aid, data: ad } of allArrows) {
      if (inRect(ad.x1, ad.y1, rx, ry, rw, rh) && inRect(ad.x2, ad.y2, rx, ry, rw, rh)) {
        arrowMembers.push({ id: aid, x1: ad.x1, y1: ad.y1, x2: ad.x2, y2: ad.y2 });
      }
    }
    startRef.current = { mx: e.clientX, my: e.clientY, ox: data.x, oy: data.y, moved: false, members, arrowMembers };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = startRef.current;
    if (!s) return;
    // NOTE: dx/dy are in screen px here — the label handle isn't scaled by
    // the world transform the way object drags are, so callers pass raw
    // deltas and we don't divide by view.s. Frame drags are typically done
    // near 100% zoom for this reason; dividing by scale is a follow-up fix.
    const dx = e.clientX - s.mx;
    const dy = e.clientY - s.my;
    if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true;
    if (!s.moved) return;
    updateFields(board.doc, board.frames, id, { x: s.ox + dx, y: s.oy + dy });
    for (const m of s.members) {
      updateFields(board.doc, m.container, m.id, { x: m.x + dx, y: m.y + dy });
    }
    for (const am of s.arrowMembers) {
      updateFields(board.doc, board.arrows, am.id, {
        x1: am.x1 + dx,
        y1: am.y1 + dy,
        x2: am.x2 + dx,
        y2: am.y2 + dy,
      });
    }
  }

  function onPointerUp() {
    const s = startRef.current;
    startRef.current = null;
    if (s && !s.moved) onSelect({ kind: "frame", id });
  }

  // F5: label/delete both counter-scale (constant on-screen size at any
  // zoom) and are pinned via a zero-size anchor wrapper + CSS `bottom: 0`
  // (label) / `bottom: 0; right: 0` (delete), same trick FontToolbar and
  // ConnectorToolbar use and for the same reason — it lands the
  // transform-origin point exactly, with no dependency on the label's own
  // (variable-length!) rendered width or height. The label's origin is
  // bottom-LEFT so the frame's actual top-left corner — the wrapper's own
  // position, computed below — stays pinned as the label grows/shrinks;
  // the delete button mirrors that at bottom-RIGHT, off the frame's
  // top-right corner, so the two don't grow into each other.
  const labelAnchorStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: -screenPxToWorld(FRAME_LABEL_GAP_PX, view.s),
    width: 0,
    height: 0,
  };
  const delAnchorStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: -screenPxToWorld(FRAME_DEL_GAP_PX, view.s),
    width: 0,
    height: 0,
  };
  return (
    <>
      <div
        className={`${styles.frame} ${selected ? styles.selected : ""}`}
        style={{ left: data.x, top: data.y, width: data.w, height: data.h }}
      >
        <div style={labelAnchorStyle}>
          <div
            ref={(el) => {
              registerBody(id, el);
              bodyRef.current = el;
            }}
            className={styles.flabel}
            style={counterScale(view.s, "bottom-left")}
            contentEditable
            suppressContentEditableWarning
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onBlur={(e) => updateFields(board.doc, board.frames, id, { label: e.currentTarget.textContent ?? "" })}
          >
            {data.label}
          </div>
        </div>
        <div style={delAnchorStyle}>
          {/* F4: routed through Canvas's single deleteSelection path, not a
              local deleteObj call, so undo grouping and selection clearing
              stay identical to the keyboard and toolbar delete. */}
          <DeleteButton zoom={view.s} onDelete={() => onDelete({ kind: "frame", id })} />
        </div>
      </div>
      {selected && (
        <ResizeHandles
          x={data.x}
          y={data.y}
          w={data.w}
          h={data.h}
          view={view}
          minW={160}
          minH={120}
          onResize={(n) => updateFields(board.doc, board.frames, id, n)}
        />
      )}
    </>
  );
}
