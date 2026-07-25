// Pure connector-routing geometry (Epic A3). Kept out of Canvas.tsx so the
// elbow-routing math is testable and readable without React in the mix.
import type { Side } from "./board-doc";

export interface Point {
  x: number;
  y: number;
}

// World units of straight travel a bound endpoint takes, perpendicular to
// its shape's side, before the first turn — keeps the line from grazing the
// shape's corner.
const ELBOW_STUB = 20;
// Corner rounding radius; clamped per-corner to half the shorter adjacent
// leg in roundedPath() so short segments never overshoot into an S-curve.
const ELBOW_RADIUS = 8;

function axisOf(side: Side): "x" | "y" {
  return side === "e" || side === "w" ? "x" : "y";
}

function normal(side: Side): Point {
  switch (side) {
    case "n":
      return { x: 0, y: -1 };
    case "s":
      return { x: 0, y: 1 };
    case "e":
      return { x: 1, y: 0 };
    case "w":
      return { x: -1, y: 0 };
  }
}

function dedupe(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
    out.push(p);
  }
  return out;
}

/**
 * Orthogonal (right-angle) polyline from `a` to `b`. `sideA`/`sideB` are the
 * shape sides the endpoints are bound to, if any:
 * - Both unbound: a single bend, H-then-V or V-then-H chosen by |dx| vs |dy|.
 * - One or both bound: the bound endpoint gets a short perpendicular stub
 *   (see ELBOW_STUB) and the final approach leg runs perpendicular to that
 *   shape's side. If both bound sides force the same axis (e.g. both "e"),
 *   a two-bend "Z" is used instead of one.
 */
export function elbowPoints(a: Point, b: Point, sideA?: Side, sideB?: Side): Point[] {
  const ea = sideA ? { x: a.x + normal(sideA).x * ELBOW_STUB, y: a.y + normal(sideA).y * ELBOW_STUB } : a;
  const eb = sideB ? { x: b.x + normal(sideB).x * ELBOW_STUB, y: b.y + normal(sideB).y * ELBOW_STUB } : b;

  const dx = eb.x - ea.x;
  const dy = eb.y - ea.y;
  const exitAxis: "x" | "y" = sideA ? axisOf(sideA) : Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  const entryAxis: "x" | "y" = sideB ? axisOf(sideB) : exitAxis === "x" ? "y" : "x";

  const mid: Point[] = [];
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    if (exitAxis !== entryAxis) {
      mid.push(exitAxis === "x" ? { x: eb.x, y: ea.y } : { x: ea.x, y: eb.y });
    } else if (exitAxis === "x") {
      const midx = (ea.x + eb.x) / 2;
      mid.push({ x: midx, y: ea.y }, { x: midx, y: eb.y });
    } else {
      const midy = (ea.y + eb.y) / 2;
      mid.push({ x: ea.x, y: midy }, { x: eb.x, y: midy });
    }
  }

  return dedupe([a, ...(sideA ? [ea] : []), ...mid, ...(sideB ? [eb] : []), b]);
}

/** Renders a polyline as an SVG path, rounding interior corners. */
export function roundedPath(pts: Point[], radius = ELBOW_RADIUS): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const toPrev = { x: prev.x - cur.x, y: prev.y - cur.y };
    const toNext = { x: next.x - cur.x, y: next.y - cur.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y);
    const lenNext = Math.hypot(toNext.x, toNext.y);
    if (lenPrev < 0.01 || lenNext < 0.01) continue;
    const r = Math.min(radius, lenPrev / 2, lenNext / 2);
    const p1 = { x: cur.x + (toPrev.x / lenPrev) * r, y: cur.y + (toPrev.y / lenPrev) * r };
    const p2 = { x: cur.x + (toNext.x / lenNext) * r, y: cur.y + (toNext.y / lenNext) * r };
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** Convenience: elbow polyline + rounding in one call. */
export function elbowPath(a: Point, b: Point, sideA?: Side, sideB?: Side, radius = ELBOW_RADIUS): string {
  return roundedPath(elbowPoints(a, b, sideA, sideB), radius);
}

/** Midpoint of an elbow route — used to position the connector toolbar. */
export function elbowMidpoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let total = 0;
  const segs: { p: Point; len: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push({ p: pts[i - 1], len });
    total += len;
  }
  if (total === 0) return pts[0];
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    const { p, len } = segs[i];
    if (target <= len) {
      const next = pts[i + 1];
      const t = len === 0 ? 0 : target / len;
      return { x: p.x + (next.x - p.x) * t, y: p.y + (next.y - p.y) * t };
    }
    target -= len;
  }
  return pts[pts.length - 1];
}
