// Pasting a spreadsheet selection (Excel / Google Sheets copy = TSV) onto
// the canvas creates a table instead of one sticky note full of tabs.
import { describe, it, expect } from "vitest";
import { pastedGrid } from "./paste";
import { createBoardDoc, addTableFromGrid, readTable } from "./board-doc";
import { MAX_ROWS, MAX_COLS, cellKey } from "./table";

describe("pastedGrid", () => {
  it("recognises a rectangular spreadsheet copy", () => {
    expect(pastedGrid("name\tqty\r\napple\t3\r\n")).toEqual([["name", "qty"], ["apple", "3"]]);
  });
  it("keeps empty cells, including leading and trailing ones", () => {
    expect(pastedGrid("\tb\na\t")).toEqual([["", "b"], ["a", ""]]);
  });
  it("plain prose is not a grid", () => {
    expect(pastedGrid("hello world\nsecond line")).toBeNull();
  });
  it("ragged tabs (tab-indented code) are not a grid", () => {
    expect(pastedGrid("if (x) {\n\treturn 1;\n}")).toBeNull();
    expect(pastedGrid("a\tb\nc")).toBeNull();
  });
  it("a block whose first column is entirely empty is indentation, not a grid", () => {
    expect(pastedGrid("\tfoo\n\tbar")).toBeNull();
  });
  it("an all-empty grid is not a grid", () => {
    expect(pastedGrid("\t\n\t")).toBeNull();
  });
});

describe("addTableFromGrid", () => {
  it("creates a table holding the grid, as one undo step", () => {
    const b = createBoardDoc();
    const id = addTableFromGrid(b, 10, 20, [["a", ""], ["c", "d"]]);
    const t = readTable(b, id)!;
    expect([t.rows, t.cols]).toEqual([2, 2]);
    expect(t.colWidths).toHaveLength(2);
    expect(t.rowHeights).toHaveLength(2);
    expect(t.cells).toEqual({ [cellKey(0, 0)]: "a", [cellKey(1, 0)]: "c", [cellKey(1, 1)]: "d" });
    expect(b.tables.get(id)!.get("x")).toBe(10);
    expect(b.tables.get(id)!.get("y")).toBe(20);
    b.undoManager.undo();
    expect(b.tables.size).toBe(0);
  });
  it("clamps an oversized grid to the table limits", () => {
    const b = createBoardDoc();
    const grid = Array.from({ length: MAX_ROWS + 5 }, (_, r) =>
      Array.from({ length: MAX_COLS + 3 }, (_, c) => `${r},${c}`));
    const t = readTable(b, addTableFromGrid(b, 0, 0, grid))!;
    expect([t.rows, t.cols]).toEqual([MAX_ROWS, MAX_COLS]);
    expect(Object.keys(t.cells)).toHaveLength(MAX_ROWS * MAX_COLS);
    expect(t.cells[cellKey(MAX_ROWS - 1, MAX_COLS - 1)]).toBe(`${MAX_ROWS - 1},${MAX_COLS - 1}`);
  });
});
