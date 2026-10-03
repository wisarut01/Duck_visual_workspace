// QA acceptance tests for the pure table model.
import { describe, it, expect } from "vitest";
import {
  MAX_ROWS, MAX_COLS, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT,
  cellKey, emptyTable, tableSize, insertRow, removeRow, insertCol, removeCol, parseTsv,
  type TableSnapshot,
} from "./table";

function filled(rows: number, cols: number): TableSnapshot {
  const t = emptyTable(rows, cols);
  const cells: Record<string, string> = {};
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[cellKey(r, c)] = `${r},${c}`;
  return { ...t, cells };
}
function grid(t: TableSnapshot): string[][] {
  return Array.from({ length: t.rows }, (_, r) =>
    Array.from({ length: t.cols }, (_, c) => t.cells[cellKey(r, c)] ?? ""));
}
function invariants(t: TableSnapshot) {
  expect(t.colWidths).toHaveLength(t.cols);
  expect(t.rowHeights).toHaveLength(t.rows);
  for (const [k, v] of Object.entries(t.cells)) {
    const m = k.match(/^cell:(\d+):(\d+)$/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(t.rows);
    expect(Number(m![2])).toBeLessThan(t.cols);
    expect(v).not.toBe("");
  }
}

describe("QA: table model", () => {
  it("cellKey format", () => {
    expect(cellKey(2, 5)).toBe("cell:2:5");
  });

  it("emptyTable uses defaults and clamps", () => {
    const t = emptyTable(3, 3);
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(3);
    expect(t.colWidths).toEqual([DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH]);
    expect(t.rowHeights).toEqual([DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT]);
    expect(t.cells).toEqual({});
    const big = emptyTable(999, 999);
    expect([big.rows, big.cols]).toEqual([MAX_ROWS, MAX_COLS]);
    const small = emptyTable(0, -4);
    expect([small.rows, small.cols]).toEqual([1, 1]);
    invariants(big);
    invariants(small);
  });

  it("tableSize sums", () => {
    expect(tableSize({ colWidths: [100, 50], rowHeights: [40, 40, 20] })).toEqual({ w: 150, h: 100 });
  });

  it("insertRow in the middle shifts cells down", () => {
    const t = filled(2, 2);
    const out = insertRow(t, 1);
    expect(grid(out)).toEqual([["0,0", "0,1"], ["", ""], ["1,0", "1,1"]]);
    invariants(out);
  });

  it("insertRow at the end appends", () => {
    const out = insertRow(filled(2, 2), 2);
    expect(grid(out)).toEqual([["0,0", "0,1"], ["1,0", "1,1"], ["", ""]]);
    invariants(out);
  });

  it("removeRow shifts cells up", () => {
    const out = removeRow(filled(3, 2), 1);
    expect(grid(out)).toEqual([["0,0", "0,1"], ["2,0", "2,1"]]);
    invariants(out);
  });

  it("insertCol / removeCol shift sideways", () => {
    const ins = insertCol(filled(2, 2), 0);
    expect(grid(ins)).toEqual([["", "0,0", "0,1"], ["", "1,0", "1,1"]]);
    invariants(ins);
    const rem = removeCol(filled(2, 3), 1);
    expect(grid(rem)).toEqual([["0,0", "0,2"], ["1,0", "1,2"]]);
    invariants(rem);
  });

  it("custom sizes travel with their row/column", () => {
    const t = { ...filled(3, 3), colWidths: [10, 20, 30], rowHeights: [1, 2, 3] };
    expect(removeCol(t, 0).colWidths).toEqual([20, 30]);
    expect(removeRow(t, 1).rowHeights).toEqual([1, 3]);
    expect(insertCol(t, 1).colWidths).toEqual([10, DEFAULT_COL_WIDTH, 20, 30]);
    expect(insertRow(t, 3).rowHeights).toEqual([1, 2, 3, DEFAULT_ROW_HEIGHT]);
  });

  it("never mutates its input", () => {
    const t = filled(3, 3);
    const before = JSON.stringify(t);
    insertRow(t, 1); removeRow(t, 1); insertCol(t, 1); removeCol(t, 1);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("refuses to go below 1x1 or above the caps (same reference back)", () => {
    const one = filled(1, 1);
    expect(removeRow(one, 0)).toBe(one);
    expect(removeCol(one, 0)).toBe(one);
    const max = emptyTable(MAX_ROWS, MAX_COLS);
    expect(insertRow(max, 0)).toBe(max);
    expect(insertCol(max, 0)).toBe(max);
  });

  it("out-of-range index is a no-op", () => {
    const t = filled(2, 2);
    expect(insertRow(t, 3)).toBe(t);
    expect(insertRow(t, -1)).toBe(t);
    expect(removeRow(t, 2)).toBe(t);
    expect(insertCol(t, 3)).toBe(t);
    expect(removeCol(t, -1)).toBe(t);
  });

  it("insert then remove round-trips", () => {
    const t = filled(3, 4);
    expect(grid(removeRow(insertRow(t, 2), 2))).toEqual(grid(t));
    expect(grid(removeCol(insertCol(t, 0), 0))).toEqual(grid(t));
  });
});

describe("QA: parseTsv", () => {
  it("null without tabs", () => {
    expect(parseTsv("just a sentence\nand another")).toBeNull();
  });
  it("parses a spreadsheet copy", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("pads ragged rows", () => {
    expect(parseTsv("a\tb\tc\nd")).toEqual([["a", "b", "c"], ["d", "", ""]]);
  });
  it("keeps empty cells", () => {
    expect(parseTsv("a\t\tc")).toEqual([["a", "", "c"]]);
  });
});
