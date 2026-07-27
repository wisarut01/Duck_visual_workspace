import { describe, it, expect } from "vitest";
import { createBoardDoc, addShape, updateFields } from "./board-doc";

describe("board-doc.ts — F3 shape styling (color/strokeWidth/filled round-trip)", () => {
  it("addShape defaults have no strokeWidth/filled set (undefined = today's rendering)", () => {
    const b = createBoardDoc();
    const id = addShape(b, "rect", 0, 0, 100, 100, 0);
    const m = b.shapes.get(id)!;
    expect(m.get("strokeWidth")).toBeUndefined();
    expect(m.get("filled")).toBeUndefined();
  });

  it("updateFields round-trips color/strokeWidth/filled through the Y.Doc", () => {
    const b = createBoardDoc();
    const id = addShape(b, "rect", 0, 0, 100, 100, 0);
    updateFields(b.doc, b.shapes, id, { color: 3, strokeWidth: 6.5, filled: false });
    const m = b.shapes.get(id)!;
    expect(m.get("color")).toBe(3);
    expect(m.get("strokeWidth")).toBe(6.5);
    expect(m.get("filled")).toBe(false);
  });

  it("a shape saved without the new fields reads back with old defaults preserved (existing boards don't break)", () => {
    const b = createBoardDoc();
    const id = addShape(b, "ellipse", 10, 10, 50, 50, 2);
    const m = b.shapes.get(id)!;
    // Simulates an "old board": only the original fields are present.
    expect(Array.from(m.keys()).sort()).toEqual(["body", "color", "h", "kind", "w", "x", "y"].sort());
  });
});
