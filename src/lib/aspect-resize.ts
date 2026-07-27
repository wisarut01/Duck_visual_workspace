// F1a: aspect-ratio-locked corner resize for images. Deliberately separate
// from Canvas.tsx's shared `ResizeHandles` (used by shapes/frames, which
// resize each axis independently) rather than adding a lock-aspect branch
// to that shared component — this batch is running in parallel with other
// agents also touching Canvas.tsx's shared toolbar/resize code (see
// PLAN.md's merge-order note), so new logic goes in its own file/component
// instead of a shared one wherever that's a reasonable option.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Resizes `start` from `corner` by screen-delta `dx`/`dy`, constrained to
 * `aspect` (= width / height). Whichever axis implies the larger scale
 * factor wins (so a mostly-horizontal drag on a tall image still grows it
 * sensibly instead of barely moving); the corner opposite the one being
 * dragged stays pinned in place, same anchoring convention as the
 * independent-axis `ResizeHandles`.
 */
export function aspectResize(corner: Corner, start: Rect, dx: number, dy: number, aspect: number, minW = 40): Rect {
  const safeAspect = aspect > 0 ? aspect : 1;
  const rawW = corner.includes("w") ? start.w - dx : start.w + dx;
  const rawH = corner.includes("n") ? start.h - dy : start.h + dy;
  const scaleW = start.w > 0 ? rawW / start.w : 1;
  const scaleH = start.h > 0 ? rawH / start.h : 1;
  const minScale = start.w > 0 ? minW / start.w : 0.01;

  let scale = Math.max(scaleW, scaleH);
  if (!Number.isFinite(scale) || scale < minScale) scale = Math.max(minScale, 0.01);

  let w = start.w * scale;
  let h = w / safeAspect;
  const minH = minW / safeAspect;
  if (w < minW || h < minH) {
    // Re-derive from whichever floor is actually binding, then recompute
    // the other dimension from it so the aspect ratio still holds exactly.
    if (minW / safeAspect >= minH) {
      w = minW;
      h = w / safeAspect;
    } else {
      h = minH;
      w = h * safeAspect;
    }
  }

  const x = corner.includes("w") ? start.x + (start.w - w) : start.x;
  const y = corner.includes("n") ? start.y + (start.h - h) : start.y;
  return { x, y, w, h };
}
