// Screen-space sizing primitive (F2, see PLAN.md). Pure, no React/DOM — see
// FontToolbar/ConnectorToolbar/`.anchor`/`.resizeHandle` in Canvas.tsx for
// the callers.
//
// Problem: FontToolbar/ConnectorToolbar and the shape hover-anchor dots /
// resize handles are all descendants of `.world`, which carries
// `transform: translate(...) scale(view.s)`. At view.s = 0.4 a 24px button
// renders 9.6px on screen — unreadable, and below any reasonable touch
// target. The fix applied throughout Canvas.tsx is a *counter-scale*:
// `transform: scale(1 / view.s)` on the element itself, composed with
// whatever positioning transform it already has. Net on-screen scale is
// `view.s * (1 / view.s) = 1` — constant regardless of zoom.

export type ScreenSpaceOrigin = "bottom-center" | "bottom-left";

export interface ScreenSpaceStyle {
  transform: string;
  transformOrigin: string;
}

// Below this, 1/zoom explodes toward Infinity as zoom -> 0, and is outright
// undefined/NaN for zoom <= 0 or a NaN input. `view.s` is clamped to
// [0.2, 3] elsewhere in Canvas.tsx during normal interaction, so this floor
// is a defensive guard against transient/invalid values (e.g. a not-yet-
// mounted view, or a future caller that doesn't share that clamp), not a
// value expected to be hit in the ordinary zoom range.
const ZOOM_FLOOR = 0.05;

/** Clamps `zoom` so `1 / zoom` never produces Infinity or NaN. */
export function safeZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > ZOOM_FLOOR ? zoom : ZOOM_FLOOR;
}

/** `1 / zoom`, guarded via safeZoom(). */
export function zoomInv(zoom: number): number {
  return 1 / safeZoom(zoom);
}

/**
 * The counter-scale transform for an element nested under `.world`.
 * `origin` picks the CSS transform-origin so the element stays visually
 * pinned at the point it anchors from while it grows/shrinks:
 *  - "bottom-center" (default): FontToolbar/ConnectorToolbar, centered
 *    above the element they control.
 *  - "bottom-left": F5's frame label tab, pinned to the frame's top-left
 *    corner.
 */
export function counterScale(zoom: number, origin: ScreenSpaceOrigin = "bottom-center"): ScreenSpaceStyle {
  return {
    transform: `scale(${zoomInv(zoom)})`,
    transformOrigin: origin === "bottom-left" ? "0% 100%" : "50% 100%",
  };
}

/**
 * Stable public name for "the inline style a screen-space toolbar applies."
 * Identical to counterScale() today; kept as a separate export so toolbar
 * call sites (and their tests) don't couple to the same name used by the
 * lower-level anchor/resize-handle callers, which only need the raw
 * transform/transformOrigin pair to compose with their own positioning
 * transform (see Canvas.module.css `.a-*`/`.resizeHandle`).
 */
export function toolbarStyle(zoom: number, origin: ScreenSpaceOrigin = "bottom-center"): ScreenSpaceStyle {
  return counterScale(zoom, origin);
}

/**
 * Converts a constant on-screen pixel distance into world units at the
 * given zoom, so a gap specified in screen px (e.g. "toolbar sits 32px
 * above its element") stays a constant 32px on screen at any zoom — a raw
 * world-unit offset shrinks/grows with zoom instead.
 */
export function screenPxToWorld(px: number, zoom: number): number {
  return px * zoomInv(zoom);
}
