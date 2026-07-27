import { describe, it, expect } from "vitest";
import { aspectResize, type Rect } from "./aspect-resize";

describe("aspect-resize.ts — aspect-ratio-locked corner resize (F1a images)", () => {
  const start: Rect = { x: 0, y: 0, w: 200, h: 100 }; // aspect 2:1
  const aspect = 2;

  it("se corner: growing right also grows down, keeping aspect, top-left pinned", () => {
    const r = aspectResize("se", start, 100, 0, aspect);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w / r.h).toBeCloseTo(aspect);
    expect(r.w).toBeGreaterThan(start.w);
  });

  it("nw corner: growing up-left keeps the bottom-right corner pinned", () => {
    const r = aspectResize("nw", start, -50, -25, aspect);
    // bottom-right corner (x+w, y+h) should stay fixed at (200, 100)
    expect(r.x + r.w).toBeCloseTo(start.x + start.w, 1);
    expect(r.y + r.h).toBeCloseTo(start.y + start.h, 1);
    expect(r.w / r.h).toBeCloseTo(aspect);
  });

  it("ne corner: pins bottom-left", () => {
    const r = aspectResize("ne", start, 50, -25, aspect);
    expect(r.x).toBeCloseTo(start.x, 1);
    expect(r.y + r.h).toBeCloseTo(start.y + start.h, 1);
    expect(r.w / r.h).toBeCloseTo(aspect);
  });

  it("sw corner: pins top-right", () => {
    const r = aspectResize("sw", start, -50, 25, aspect);
    expect(r.x + r.w).toBeCloseTo(start.x + start.w, 1);
    expect(r.y).toBeCloseTo(start.y, 1);
    expect(r.w / r.h).toBeCloseTo(aspect);
  });

  it("shrinking never crosses below the minimum width floor", () => {
    const r = aspectResize("se", start, -1000, -1000, aspect, 40);
    expect(r.w).toBeGreaterThanOrEqual(40 - 0.01);
    expect(r.w / r.h).toBeCloseTo(aspect);
  });

  it("always preserves the given aspect ratio regardless of which axis dominates the drag", () => {
    const rWide = aspectResize("se", start, 300, 5, aspect);
    const rTall = aspectResize("se", start, 5, 300, aspect);
    expect(rWide.w / rWide.h).toBeCloseTo(aspect);
    expect(rTall.w / rTall.h).toBeCloseTo(aspect);
  });

  it("a portrait aspect ratio (< 1) is preserved too", () => {
    const portraitStart: Rect = { x: 0, y: 0, w: 100, h: 200 };
    const r = aspectResize("se", portraitStart, 50, 0, 0.5);
    expect(r.w / r.h).toBeCloseTo(0.5);
  });
});
