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
// Constraint that shaped this palette: a *fixed*, non-theme-aware hex
// cannot hit 4.5:1 against both the light-theme panel/bg (near-white,
// luminance ~1) and the dark-theme panel/bg (near-black, luminance
// ~0.02-0.06) at once — WCAG's own formula makes the two requirements
// mutually exclusive (light bg needs luminance <= ~0.18, dark bg needs
// luminance >= ~0.26; see palette.test.ts for the worked numbers). That's
// exactly the problem `var(--ink)` already solves by flipping per theme,
// which is why it stays the default. These 6 are dark, saturated colors
// verified at >= 4.5:1 against light-theme white and all 6 NOTE_COLORS
// backgrounds (the sticky-note background is theme-invariant, so that
// bar is always achievable) — they are legible in light theme and on any
// sticky note in either theme, but a low-contrast, documented gap against
// the *dark*-theme panel/canvas background if applied to a plain text
// element with no colored backing. See CLAUDE.md progress log for this
// batch for the fuller writeup.
export const TEXT_COLORS: { hex: string; name: string }[] = [
  { hex: "#7a1420", name: "red" },
  { hex: "#14532d", name: "green" },
  { hex: "#1e3a8a", name: "blue" },
  { hex: "#4c1d7a", name: "purple" },
  { hex: "#6b3410", name: "brown" },
  { hex: "#1c2030", name: "slate" },
];
