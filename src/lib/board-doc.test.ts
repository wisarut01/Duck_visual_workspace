import { describe, it, expect } from "vitest";
import { createBoardDoc, addShape, addNote, addText, updateFields, deleteObj } from "./board-doc";

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
