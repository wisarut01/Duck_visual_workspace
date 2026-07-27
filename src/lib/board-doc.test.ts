import { describe, it, expect } from "vitest";
import {
  createBoardDoc,
  addShape,
  addNote,
  addText,
  addImage,
  updateFields,
  deleteObj,
  // Explicit type imports matter here: `ImageData` is also a DOM global, so
  // without this the assertions below silently type-check against the wrong
  // (browser) ImageData instead of the board's.
  type ShapeData,
  type ImageData,
} from "./board-doc";

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

describe("board-doc.ts — F6 text styling (bold/italic/underline/textColor round-trip)", () => {
  it("addNote/addShape/addText default with the style fields undefined", () => {
    const b = createBoardDoc();
    const noteId = addNote(b, 0, 0, 0, "you");
    const shapeId = addShape(b, "rect", 0, 0, 100, 100, 0);
    const textId = addText(b, 0, 0);
    for (const [container, id] of [
      [b.notes, noteId],
      [b.shapes, shapeId],
      [b.texts, textId],
    ] as const) {
      const m = container.get(id)!;
      expect(m.get("bold")).toBeUndefined();
      expect(m.get("italic")).toBeUndefined();
      expect(m.get("underline")).toBeUndefined();
      expect(m.get("textColor")).toBeUndefined();
    }
  });

  it("updateFields round-trips bold/italic/underline/textColor on a note", () => {
    const b = createBoardDoc();
    const id = addNote(b, 0, 0, 0, "you");
    updateFields(b.doc, b.notes, id, { bold: true, italic: true, underline: true, textColor: 2 });
    const m = b.notes.get(id)!;
    expect(m.get("bold")).toBe(true);
    expect(m.get("italic")).toBe(true);
    expect(m.get("underline")).toBe(true);
    expect(m.get("textColor")).toBe(2);
  });

  it("round-trips on a shape and a text element too", () => {
    const b = createBoardDoc();
    const shapeId = addShape(b, "rect", 0, 0, 100, 100, 0);
    const textId = addText(b, 0, 0);
    updateFields(b.doc, b.shapes, shapeId, { bold: true, textColor: 0 });
    updateFields(b.doc, b.texts, textId, { underline: true, textColor: 5 });
    expect(b.shapes.get(shapeId)!.get("bold")).toBe(true);
    expect(b.shapes.get(shapeId)!.get("textColor")).toBe(0);
    expect(b.texts.get(textId)!.get("underline")).toBe(true);
    expect(b.texts.get(textId)!.get("textColor")).toBe(5);
  });
});

describe("board-doc.ts — F4 delete + undo contract", () => {
  it("deleteObj removes the object, and undoManager.undo() restores it", () => {
    const b = createBoardDoc();
    const id = addShape(b, "rect", 0, 0, 100, 100, 0);
    expect(b.shapes.size).toBe(1);
    // Without this, the create and the delete below (a synchronous test,
    // unlike real usage where some time passes in between) fall inside the
    // same 500ms captureTimeout window and merge into a single undo step —
    // undoing "create-then-delete" as one unit nets back to zero shapes,
    // not one. stopCapturing() forces them into separate undo steps, same
    // as what naturally happens once a user does anything else in between.
    b.undoManager.stopCapturing();
    deleteObj(b.doc, b.shapes, id);
    expect(b.shapes.size).toBe(0);
    b.undoManager.undo();
    expect(b.shapes.size).toBe(1);
    expect(b.shapes.get(id)).toBeTruthy();
  });
});

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
