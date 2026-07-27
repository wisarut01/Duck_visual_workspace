import { describe, it, expect } from "vitest";
import {
  createBoardDoc,
  addShape,
  addImage,
  updateFields,
  deleteObj,
  type ShapeData,
  type ImageData,
} from "./board-doc";

describe("board-doc.ts — images container (F1a)", () => {
  it("createBoardDoc exposes an empty `images` Y.Map by default", () => {
    const b = createBoardDoc();
    expect(b.images).toBeDefined();
    expect(b.images.size).toBe(0);
  });

  it("addImage stores an ImageData record retrievable via the images map", () => {
    const b = createBoardDoc();
    const id = addImage(b, 10, 20, 300, 200, "https://example.com/x.png", 600, 400);
    expect(b.images.size).toBe(1);
    const m = b.images.get(id);
    expect(m).toBeDefined();
    const data = m!.toJSON() as ImageData;
    expect(data).toEqual({
      x: 10,
      y: 20,
      w: 300,
      h: 200,
      url: "https://example.com/x.png",
      naturalW: 600,
      naturalH: 400,
    });
  });

  it("updateFields round-trips a patch onto an existing image", () => {
    const b = createBoardDoc();
    const id = addImage(b, 0, 0, 100, 100, "https://example.com/y.png", 100, 100);
    updateFields(b.doc, b.images, id, { x: 50, y: 60, w: 200, h: 200 });
    const data = b.images.get(id)!.toJSON() as ImageData;
    expect(data.x).toBe(50);
    expect(data.y).toBe(60);
    expect(data.w).toBe(200);
    expect(data.h).toBe(200);
  });

  it("deleteObj removes an image", () => {
    const b = createBoardDoc();
    const id = addImage(b, 0, 0, 100, 100, "https://example.com/z.png", 100, 100);
    expect(b.images.size).toBe(1);
    deleteObj(b.doc, b.images, id);
    expect(b.images.size).toBe(0);
  });

  it("the images container is tracked by the undoManager (undo restores a deleted image)", () => {
    const b = createBoardDoc();
    const id = addImage(b, 0, 0, 100, 100, "https://example.com/w.png", 100, 100);
    // Forces the add and the delete into separate undo-stack entries, same
    // as they'd naturally be in real usage (a real user's create and later
    // delete are seconds apart, well past the 500ms capture window) —
    // without this, both transactions fire back-to-back in the same tick
    // and merge into a single undo step whose net effect is a no-op.
    b.undoManager.stopCapturing();
    deleteObj(b.doc, b.images, id);
    expect(b.images.size).toBe(0);
    b.undoManager.undo();
    expect(b.images.size).toBe(1);
    expect(b.images.get(id)).toBeDefined();
  });

  it("a doc that never touches images (old-board simulation) still reports images.size === 0", () => {
    const b = createBoardDoc();
    addShape(b, "rect", 0, 0, 50, 50, 0);
    expect(b.images.size).toBe(0);
  });

  it("shapes round-trip unaffected by the images container existing alongside them", () => {
    const b = createBoardDoc();
    const id = addShape(b, "ellipse", 1, 2, 3, 4, 5);
    const data = b.shapes.get(id)!.toJSON() as ShapeData;
    expect(data.kind).toBe("ellipse");
  });
});
