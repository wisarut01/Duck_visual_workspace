import { describe, it, expect } from "vitest";
import {
  objectBounds,
  unionBounds,
  objectsInRegion,
  fitToPage,
  type ExportObject,
  type Rect,
} from "./export-bounds";
import type { NoteData, ShapeData, TextData, FrameData, ArrowData, ImageData } from "./board-doc";

describe("export-bounds.ts — pure geometry core for PDF export (F1b)", () => {
  describe("objectBounds", () => {
    it("note: fixed 172px card size (matches Canvas.module.css .note)", () => {
      const data: NoteData = { x: 10, y: 20, color: 0, body: "hi", author: "a", votes: 0 };
      const r = objectBounds("note", data);
      expect(r.x).toBe(10);
      expect(r.y).toBe(20);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });

    it("shape: x/y/w/h taken directly", () => {
      const data: ShapeData = { kind: "rect", x: 5, y: 6, w: 100, h: 50, color: 0, body: "" };
      expect(objectBounds("shape", data)).toEqual({ x: 5, y: 6, w: 100, h: 50 });
    });

    it("frame: x/y/w/h taken directly", () => {
      const data: FrameData = { x: 0, y: 0, w: 400, h: 300, label: "F" };
      expect(objectBounds("frame", data)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
    });

    it("image: x/y/w/h taken directly", () => {
      const data: ImageData = { x: 1, y: 2, w: 300, h: 200, url: "u", naturalW: 300, naturalH: 200 };
      expect(objectBounds("image", data)).toEqual({ x: 1, y: 2, w: 300, h: 200 });
    });

    it("text: a small positive box around x/y (exact size doesn't matter, just non-degenerate)", () => {
      const data: TextData = { x: 40, y: 50, body: "hello world" };
      const r = objectBounds("text", data);
      expect(r.x).toBeLessThanOrEqual(40);
      expect(r.y).toBeLessThanOrEqual(50);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });

    it("arrow: bounding box of resolved endpoints (with a little padding for stroke)", () => {
      const data: ArrowData = { x1: 0, y1: 0, x2: 100, y2: 40 };
      const r = objectBounds("arrow", data);
      expect(r.x).toBeLessThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(0);
      expect(r.x + r.w).toBeGreaterThanOrEqual(100);
      expect(r.y + r.h).toBeGreaterThanOrEqual(40);
    });

    it("arrow: handles a vertical or horizontal line (zero-width/height base box) without a degenerate rect", () => {
      const vertical: ArrowData = { x1: 10, y1: 0, x2: 10, y2: 100 };
      const r = objectBounds("arrow", vertical);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBe(100);
    });
  });

  describe("unionBounds", () => {
    it("returns null for an empty list", () => {
      expect(unionBounds([])).toBeNull();
    });

    it("returns the same rect for a single input", () => {
      const rect: Rect = { x: 1, y: 2, w: 3, h: 4 };
      expect(unionBounds([rect])).toEqual(rect);
    });

    it("unions two disjoint rects into their bounding box", () => {
      const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
      const b: Rect = { x: 50, y: 60, w: 10, h: 10 };
      expect(unionBounds([a, b])).toEqual({ x: 0, y: 0, w: 60, h: 70 });
    });

    it("unions overlapping rects correctly", () => {
      const a: Rect = { x: 0, y: 0, w: 20, h: 20 };
      const b: Rect = { x: 10, y: 10, w: 20, h: 20 };
      expect(unionBounds([a, b])).toEqual({ x: 0, y: 0, w: 30, h: 30 });
    });
  });

  describe("objectsInRegion", () => {
    const region: Rect = { x: 0, y: 0, w: 100, h: 100 };
    function obj(id: string, r: Rect): ExportObject {
      return { kind: "shape", id, bounds: r };
    }

    it("includes an object fully inside the region", () => {
      const objs = [obj("a", { x: 10, y: 10, w: 20, h: 20 })];
      expect(objectsInRegion(objs, region).map((o) => o.id)).toEqual(["a"]);
    });

    it("includes an object that only partially overlaps (half-covered sticky should export)", () => {
      const objs = [obj("a", { x: 90, y: 90, w: 40, h: 40 })];
      expect(objectsInRegion(objs, region).map((o) => o.id)).toEqual(["a"]);
    });

    it("includes an object exactly touching the region edge", () => {
      const objs = [obj("a", { x: 100, y: 0, w: 10, h: 10 })];
      expect(objectsInRegion(objs, region).map((o) => o.id)).toEqual(["a"]);
    });

    it("includes an object overlapping by just 1px", () => {
      const objs = [obj("a", { x: 99, y: 99, w: 10, h: 10 })];
      expect(objectsInRegion(objs, region).map((o) => o.id)).toEqual(["a"]);
    });

    it("excludes an object fully outside the region", () => {
      const objs = [obj("a", { x: 200, y: 200, w: 10, h: 10 })];
      expect(objectsInRegion(objs, region)).toEqual([]);
    });

    it("excludes an object 1px away from the region", () => {
      const objs = [obj("a", { x: 111, y: 0, w: 10, h: 10 })];
      expect(objectsInRegion(objs, region)).toEqual([]);
    });
  });

  describe("fitToPage", () => {
    it("scales a wide content rect to fit page width, centering vertically", () => {
      const content: Rect = { x: 0, y: 0, w: 1000, h: 100 };
      const { scale, offsetX, offsetY } = fitToPage(content, 500, 500, 0);
      expect(scale).toBeCloseTo(0.5);
      expect(offsetX).toBeCloseTo(0);
      expect(offsetY).toBeCloseTo((500 - 100 * 0.5) / 2);
    });

    it("scales a tall content rect to fit page height, centering horizontally", () => {
      const content: Rect = { x: 0, y: 0, w: 100, h: 1000 };
      const { scale, offsetX } = fitToPage(content, 500, 500, 0);
      expect(scale).toBeCloseTo(0.5);
      expect(offsetX).toBeCloseTo((500 - 100 * 0.5) / 2);
    });

    it("a square content rect on a square page fills it exactly (minus margin)", () => {
      const content: Rect = { x: 0, y: 0, w: 200, h: 200 };
      const { scale, offsetX, offsetY } = fitToPage(content, 400, 400, 20);
      expect(scale).toBeCloseTo(1.8); // (400 - 2*20) / 200
      expect(offsetX).toBeCloseTo(20);
      expect(offsetY).toBeCloseTo(20);
    });

    it("respects margin on all sides", () => {
      const content: Rect = { x: 0, y: 0, w: 100, h: 100 };
      const { scale } = fitToPage(content, 220, 220, 10);
      expect(scale).toBeCloseTo(2); // (220 - 20) / 100
    });

    it("accounts for a non-zero content origin (offset is relative to content.x/y, not 0,0)", () => {
      const content: Rect = { x: 500, y: 500, w: 100, h: 100 };
      const { scale, offsetX, offsetY } = fitToPage(content, 220, 220, 10);
      expect(scale).toBeCloseTo(2);
      expect(offsetX).toBeCloseTo(10);
      expect(offsetY).toBeCloseTo(10);
    });

    it("degenerate zero-area region: falls back to scale 1 instead of NaN/Infinity", () => {
      const content: Rect = { x: 0, y: 0, w: 0, h: 0 };
      const { scale, offsetX, offsetY } = fitToPage(content, 400, 400, 0);
      expect(Number.isFinite(scale)).toBe(true);
      expect(Number.isFinite(offsetX)).toBe(true);
      expect(Number.isFinite(offsetY)).toBe(true);
    });

    it("degenerate zero-width (but non-zero height) region doesn't divide by zero", () => {
      const content: Rect = { x: 0, y: 0, w: 0, h: 100 };
      const { scale } = fitToPage(content, 400, 400, 0);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThan(0);
    });
  });
});
