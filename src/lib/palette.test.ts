import { describe, it, expect } from "vitest";
import { NOTE_COLORS, TEXT_COLORS, contrastRatio, textColorVar } from "./palette";

describe("palette.ts (regression)", () => {
  it("defines at least one sticky color", () => {
    expect(NOTE_COLORS.length).toBeGreaterThan(0);
  });

  it("every entry has a bg hex color and a non-empty tag", () => {
    for (const { bg, tag } of NOTE_COLORS) {
      expect(bg).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(typeof tag).toBe("string");
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  it("tags are unique (each color slot has a distinct label)", () => {
    const tags = NOTE_COLORS.map((c) => c.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("bg colors are unique (no accidental duplicate swatch)", () => {
    const bgs = NOTE_COLORS.map((c) => c.bg);
    expect(new Set(bgs).size).toBe(bgs.length);
  });
});

describe("contrastRatio (F6 — WCAG relative luminance)", () => {
  it("white vs black is 21:1 (the maximum possible ratio)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("a color against itself is 1:1", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
    expect(contrastRatio("#ffd94a", "#ffd94a")).toBeCloseTo(1, 5);
  });

  it("is order-independent (contrastRatio(a,b) === contrastRatio(b,a))", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456"), 10);
  });

  it("accepts 3-digit shorthand hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 1);
  });

  it("accepts hex without a leading #", () => {
    expect(contrastRatio("ffffff", "000000")).toBeCloseTo(21, 1);
  });
});

describe("TEXT_COLORS (F6)", () => {
  // Theme token values these are checked against, kept in sync with
  // src/app/globals.css (:root and :root[data-theme="dark"]).
  const LIGHT_PANEL = "#ffffff";
  const LIGHT_BG = "#eef0f4";
  const DARK_PANEL = "#212530";
  const DARK_BG = "#16181d";

  it("has at least a handful of entries, each a valid light/dark hex pair + name", () => {
    expect(TEXT_COLORS.length).toBeGreaterThanOrEqual(4);
    for (const { light, dark, name } of TEXT_COLORS) {
      expect(light).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(dark).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("the light variant is >= 4.5:1 against both light-theme backgrounds", () => {
    for (const { light, name } of TEXT_COLORS) {
      expect(contrastRatio(light, LIGHT_PANEL), `${name} vs light panel`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light, LIGHT_BG), `${name} vs light canvas`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the dark variant is >= 4.5:1 against both dark-theme backgrounds", () => {
    for (const { dark, name } of TEXT_COLORS) {
      expect(contrastRatio(dark, DARK_PANEL), `${name} vs dark panel`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark, DARK_BG), `${name} vs dark canvas`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Sticky notes keep a pastel, theme-invariant background in both themes
  // (their base text is the hardcoded #33240a for the same reason), so it is
  // the *light* variant that gets used there regardless of theme.
  it("the light variant is >= 4.5:1 against every NOTE_COLORS sticky background", () => {
    for (const { light, name } of TEXT_COLORS) {
      for (const nc of NOTE_COLORS) {
        expect(contrastRatio(light, nc.bg), `${name} vs ${nc.tag}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("textColorVar (F6)", () => {
  it("maps an index to the themed or fixed custom property", () => {
    expect(textColorVar(0, "themed")).toBe("var(--text-0)");
    expect(textColorVar(0, "fixed")).toBe("var(--text-0-fixed)");
    expect(textColorVar(TEXT_COLORS.length - 1, "themed")).toBe(`var(--text-${TEXT_COLORS.length - 1})`);
  });

  it("returns undefined for an out-of-range index so the body falls back to var(--ink)", () => {
    expect(textColorVar(-1, "themed")).toBeUndefined();
    expect(textColorVar(TEXT_COLORS.length, "themed")).toBeUndefined();
  });
});
