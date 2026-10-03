import { describe, it, expect } from "vitest";
import {
  MAX_ROWS,
  MAX_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  cellKey,
  emptyTable,
  tableSize,
  insertRow,
  removeRow,
  insertCol,
  removeCol,
  parseTsv,
  type TableSnapshot,
} from "./table";

function sample(): TableSnapshot {
  return {
    rows: 2,
    cols: 2,
    colWidths: [100, 120],
    rowHeights: [30, 50],
    cells: { [cellKey(0, 0)]: "a", [cellKey(0, 1)]: "b", [cellKey(1, 0)]: "c", [cellKey(1, 1)]: "d" },
  };
}

describe("table.ts", () => {
  it("cellKey format", () => {
    expect(cellKey(2, 5)).toBe("cell:2:5");
  });

  it("emptyTable uses default sizes and clamps", () => {
    const t = emptyTable(3, 4);
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(4);
    expect(t.colWidths).toEqual(Array(4).fill(DEFAULT_COL_WIDTH));
    expect(t.rowHeights).toEqual(Array(3).fill(DEFAULT_ROW_HEIGHT));
    expect(t.cells).toEqual({});
    const big = emptyTable(999, 999);
    expect(big.rows).toBe(MAX_ROWS);
    expect(big.cols).toBe(MAX_COLS);
    const small = emptyTable(0, -3);
    expect(small.rows).toBe(1);
    expect(small.cols).toBe(1);
  });

  it("tableSize sums", () => {
    expect(tableSize({ colWidths: [10, 20], rowHeights: [1, 2, 3] })).toEqual({ w: 30, h: 6 });
  });

  it("insertRow shifts rows down, keeps lengths in sync, is pure", () => {
    const t = sample();
    const snap = JSON.parse(JSON.stringify(t));
    const r = insertRow(t, 1);
    expect(t).toEqual(snap);
    expect(r.rows).toBe(3);
    expect(r.rowHeights).toEqual([30, DEFAULT_ROW_HEIGHT, 50]);
    expect(r.colWidths).toEqual([100, 120]);
    expect(r.cells).toEqual({
      "cell:0:0": "a",
      "cell:0:1": "b",
      "cell:2:0": "c",
      "cell:2:1": "d",
    });
  });

  it("insertRow at end and at 0", () => {
    expect(insertRow(sample(), 2).rows).toBe(3);
    expect(insertRow(sample(), 0).cells["cell:1:0"]).toBe("a");
  });

  it("insertRow no-ops: out of range or at max", () => {
    const t = sample();
    expect(insertRow(t, -1)).toBe(t);
    expect(insertRow(t, 3)).toBe(t);
    const full = emptyTable(MAX_ROWS, 2);
    expect(insertRow(full, 0)).toBe(full);
  });

  it("removeRow shifts later rows up and drops removed cells", () => {
    const t = sample();
    const r = removeRow(t, 0);
    expect(r.rows).toBe(1);
    expect(r.rowHeights).toEqual([50]);
    expect(r.cells).toEqual({ "cell:0:0": "c", "cell:0:1": "d" });
    expect(t.rows).toBe(2);
  });

  it("removeRow no-ops: last row or out of range", () => {
    const one = emptyTable(1, 2);
    expect(removeRow(one, 0)).toBe(one);
    const t = sample();
    expect(removeRow(t, 2)).toBe(t);
    expect(removeRow(t, -1)).toBe(t);
  });

  it("insertCol / removeCol mirror the row behaviour", () => {
    const t = sample();
    const i = insertCol(t, 1);
    expect(i.cols).toBe(3);
    expect(i.colWidths).toEqual([100, DEFAULT_COL_WIDTH, 120]);
    expect(i.cells).toEqual({
      "cell:0:0": "a",
      "cell:0:2": "b",
      "cell:1:0": "c",
      "cell:1:2": "d",
    });
    const r = removeCol(t, 0);
    expect(r.cols).toBe(1);
    expect(r.colWidths).toEqual([120]);
    expect(r.cells).toEqual({ "cell:0:0": "b", "cell:1:0": "d" });
    expect(insertCol(t, 5)).toBe(t);
    const full = emptyTable(2, MAX_COLS);
    expect(insertCol(full, 0)).toBe(full);
    const one = emptyTable(2, 1);
    expect(removeCol(one, 0)).toBe(one);
    expect(removeCol(t, 2)).toBe(t);
  });

  it("drops empty-string cells", () => {
    const t = sample();
    t.cells["cell:0:0"] = "";
    expect(insertRow(t, 2).cells["cell:0:0"]).toBeUndefined();
    expect("cell:0:0" in removeCol(t, 1).cells).toBe(false);
  });

  describe("parseTsv", () => {
    it("null without a tab", () => {
      expect(parseTsv("hello\nworld")).toBeNull();
      expect(parseTsv("")).toBeNull();
    });
    it("parses, normalises newlines, drops one trailing newline", () => {
      expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
      expect(parseTsv("a\tb\rc\td")).toEqual([
        ["a", "b"],
        ["c", "d"],
      ]);
    });
    it("only drops a single trailing newline", () => {
      expect(parseTsv("a\tb\n\n")).toEqual([
        ["a", "b"],
        ["", ""],
      ]);
    });
    it("pads short rows", () => {
      expect(parseTsv("a\tb\tc\nd")).toEqual([
        ["a", "b", "c"],
        ["d", "", ""],
      ]);
    });
  });
});
