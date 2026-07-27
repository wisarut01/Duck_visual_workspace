// DESIGN.md §1.3 — gouache/risograph sticky + shape palette.
export const NOTE_COLORS: { bg: string; tag: string }[] = [
  { bg: "#ffd94a", tag: "idea" },
  { bg: "#ff9db0", tag: "risk" },
  { bg: "#a7e0a0", tag: "yes" },
  { bg: "#9cc9ff", tag: "note" },
  { bg: "#c9b3ff", tag: "maybe" },
  { bg: "#ffc078", tag: "todo" },
];

// F6 (text styling): WCAG relative-luminance contrast ratio between two
// hex colors, per https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and
// the contrast formula in https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio.
// Accepts 3- or 6-digit hex, with or without a leading "#".
function srgbChannelToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/** WCAG contrast ratio between two colors, always >= 1 (order-independent). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// F6: explicit text-color options for note/shape/text bodies. Undefined
// stays the default meaning ("auto" — renders as the theme-aware
// `var(--ink)`, never resolved to a hex here); these 6 are additional,
// fixed choices a user can pick instead.
//
// Why each entry is a *pair*, not one hex: a single fixed color cannot hit
// 4.5:1 against both the light-theme panel/canvas (near-white) and the
// dark-theme one (near-black). WCAG's own formula makes the two mutually
// exclusive — a light background needs luminance <= ~0.18, this app's dark
// background needs >= ~0.26 (worked numbers in palette.test.ts). So the
// color flips with the theme, exactly like `--ink` already does, via the
// `--text-N` custom properties defined per theme block in globals.css.
//
// `light` doubles as the *theme-invariant* value (`--text-N-fixed`) used on
// sticky notes: a note's background is a fixed pastel that does not follow
// the theme (and its base text color is the hardcoded #33240a for the same
// reason), so note text must stay dark in both themes.
export interface TextColor {
  name: string;
  /** Used in light theme, and always on sticky notes. */
  light: string;
  /** Used in dark theme on shapes/text (which sit on the themed canvas). */
  dark: string;
}
export const TEXT_COLORS: TextColor[] = [
  { name: "red", light: "#7a1420", dark: "#ff9d9d" },
  { name: "green", light: "#14532d", dark: "#86efac" },
  { name: "blue", light: "#1e3a8a", dark: "#93c5fd" },
  { name: "purple", light: "#4c1d7a", dark: "#d8b4fe" },
  { name: "brown", light: "#6b3410", dark: "#fcd34d" },
  { name: "slate", light: "#1c2030", dark: "#e2e8f0" },
];

/**
 * The CSS custom property a given text color resolves through.
 * `variant: "themed"` flips with the active theme (shapes/text bodies, which
 * sit on the themed canvas); `"fixed"` never does (sticky notes, whose
 * pastel background is theme-invariant).
 */
export function textColorVar(index: number, variant: "themed" | "fixed"): string | undefined {
  if (index < 0 || index >= TEXT_COLORS.length) return undefined;
  return variant === "fixed" ? `var(--text-${index}-fixed)` : `var(--text-${index})`;
}
