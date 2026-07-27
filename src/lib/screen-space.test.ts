// New-feature tests for F2 (screen-space toolbars). See PLAN.md "F2".
import { describe, it, expect } from "vitest";
import { counterScale, safeZoom, zoomInv, screenPxToWorld, toolbarStyle } from "./screen-space";

describe("screen-space.ts (F2 — counter-scale primitive)", () => {
  describe("safeZoom", () => {
    it("passes through any normal positive zoom", () => {
      expect(safeZoom(1)).toBe(1);
      expect(safeZoom(0.5)).toBe(0.5);
      expect(safeZoom(3)).toBe(3);
    });

    it("clamps zero to the floor instead of producing Infinity downstream", () => {
      expect(safeZoom(0)).toBeGreaterThan(0);
      expect(Number.isFinite(1 / safeZoom(0))).toBe(true);
    });

    it("clamps negative zoom to the floor", () => {
      expect(safeZoom(-2)).toBeGreaterThan(0);
    });

    it("clamps NaN to the floor", () => {
      expect(Number.isFinite(safeZoom(NaN))).toBe(true);
      expect(safeZoom(NaN)).toBeGreaterThan(0);
    });
  });

  describe("zoomInv", () => {
    it("is the reciprocal of zoom at normal values", () => {
      expect(zoomInv(1)).toBeCloseTo(1);
      expect(zoomInv(2)).toBeCloseTo(0.5);
      expect(zoomInv(0.5)).toBeCloseTo(2);
    });

    it("never returns Infinity/NaN at the zoom=0 edge case", () => {
      expect(Number.isFinite(zoomInv(0))).toBe(true);
    });
  });

  describe("counterScale", () => {
    it("is identity at zoom 1", () => {
      const s = counterScale(1);
      expect(s.transform).toBe("scale(1)");
    });

    it("scales up 2x at zoom 0.5 (zoomed out -> toolbar must grow to compensate)", () => {
      const s = counterScale(0.5);
      expect(s.transform).toBe("scale(2)");
    });

    it("scales down to 0.5x at zoom 2 (zoomed in -> toolbar must shrink to compensate)", () => {
      const s = counterScale(2);
      expect(s.transform).toBe("scale(0.5)");
    });

    it("guards zoom 0 (or negative/NaN) to a finite, non-explosive scale", () => {
      const s = counterScale(0);
      const match = /^scale\(([-\d.]+)\)$/.exec(s.transform);
      expect(match).not.toBeNull();
      const factor = Number(match![1]);
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBeGreaterThan(0);
    });

    it("defaults transform-origin to bottom-center", () => {
      expect(counterScale(1).transformOrigin).toBe("50% 100%");
    });

    it("supports a bottom-left origin (for F5's frame label)", () => {
      expect(counterScale(1, "bottom-left").transformOrigin).toBe("0% 100%");
    });
  });

  describe("screenPxToWorld", () => {
    it("is identity at zoom 1", () => {
      expect(screenPxToWorld(32, 1)).toBeCloseTo(32);
    });

    it("grows the world-unit distance as zoom shrinks, keeping the on-screen gap constant", () => {
      // at zoom 0.5, a screen-constant 32px gap needs 64 world units
      expect(screenPxToWorld(32, 0.5)).toBeCloseTo(64);
    });

    it("shrinks the world-unit distance as zoom grows", () => {
      expect(screenPxToWorld(32, 2)).toBeCloseTo(16);
    });

    it("stays finite at the zoom=0 edge case", () => {
      expect(Number.isFinite(screenPxToWorld(32, 0))).toBe(true);
    });
  });

  describe("toolbarStyle", () => {
    it("matches counterScale's output (stable public alias for toolbar callers)", () => {
      expect(toolbarStyle(0.5)).toEqual(counterScale(0.5));
      expect(toolbarStyle(2, "bottom-left")).toEqual(counterScale(2, "bottom-left"));
    });
  });
});
