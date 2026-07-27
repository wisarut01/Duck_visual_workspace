import { describe, it, expect } from "vitest";
import { NOTE_COLORS, TEXT_COLORS, contrastRatio } from "./palette";

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
  it("has at least a handful of entries, each a valid hex + name", () => {
    expect(TEXT_COLORS.length).toBeGreaterThanOrEqual(4);
    for (const { hex, name } of TEXT_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("every entry is >= 4.5:1 against the light-theme panel background (white)", () => {
    for (const { hex, name } of TEXT_COLORS) {
      expect(contrastRatio(hex, "#ffffff"), `${name} vs light panel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every entry is >= 4.5:1 against every NOTE_COLORS sticky background", () => {
    for (const { hex, name } of TEXT_COLORS) {
      for (const nc of NOTE_COLORS) {
        expect(contrastRatio(hex, nc.bg), `${name} vs ${nc.tag}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
