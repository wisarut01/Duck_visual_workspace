import { describe, it, expect } from "vitest";
import { NOTE_COLORS } from "./palette";

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
