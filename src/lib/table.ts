// Pure table model — no React, no Yjs. The Y.Doc layer (board-doc.ts) reads a
// table into a TableSnapshot, runs one of these mutators, and writes the
// result back inside a single transaction.
export const MAX_ROWS = 30;
export const MAX_COLS = 12;
export const DEFAULT_COL_WIDTH = 140;
export const DEFAULT_ROW_HEIGHT = 40;

export interface TableSnapshot {
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  // Keyed by cellKey(r, c); a missing key is an empty cell.
  cells: Record<string, string>;
}

export function cellKey(r: number, c: number): string {
  return `cell:${r}:${c}`;
}

function clamp(n: number, max: number): number {
  const v = Math.floor(Number.isFinite(n) ? n : 1);
  return Math.min(max, Math.max(1, v));
}

export function emptyTable(rows: number, cols: number): TableSnapshot {
  const r = clamp(rows, MAX_ROWS);
  const c = clamp(cols, MAX_COLS);
  return {
    rows: r,
    cols: c,
    colWidths: Array(c).fill(DEFAULT_COL_WIDTH),
    rowHeights: Array(r).fill(DEFAULT_ROW_HEIGHT),
    cells: {},
  };
}

export function tableSize(t: Pick<TableSnapshot, "colWidths" | "rowHeights">): { w: number; h: number } {
  return {
    w: t.colWidths.reduce((a, b) => a + b, 0),
    h: t.rowHeights.reduce((a, b) => a + b, 0),
  };
}

// Rebuilds `cells`, mapping each (r, c) through `remap`; returning null drops
// the cell. Empty strings are never kept.
function remapCells(
  cells: Record<string, string>,
  remap: (r: number, c: number) => [number, number] | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(cells)) {
    if (text === "") continue;
    const m = /^cell:(\d+):(\d+)$/.exec(key);
    if (!m) continue;
    const to = remap(Number(m[1]), Number(m[2]));
    if (to) out[cellKey(to[0], to[1])] = text;
  }
  return out;
}

export function insertRow(t: TableSnapshot, at: number): TableSnapshot {
  if (t.rows >= MAX_ROWS || !Number.isInteger(at) || at < 0 || at > t.rows) return t;
  const rowHeights = [...t.rowHeights];
  rowHeights.splice(at, 0, DEFAULT_ROW_HEIGHT);
  return {
    rows: t.rows + 1,
    cols: t.cols,
    colWidths: [...t.colWidths],
    rowHeights,
    cells: remapCells(t.cells, (r, c) => [r >= at ? r + 1 : r, c]),
  };
}

export function removeRow(t: TableSnapshot, at: number): TableSnapshot {
  if (t.rows <= 1 || !Number.isInteger(at) || at < 0 || at >= t.rows) return t;
  const rowHeights = [...t.rowHeights];
  rowHeights.splice(at, 1);
  return {
    rows: t.rows - 1,
    cols: t.cols,
    colWidths: [...t.colWidths],
    rowHeights,
    cells: remapCells(t.cells, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c])),
  };
}

export function insertCol(t: TableSnapshot, at: number): TableSnapshot {
  if (t.cols >= MAX_COLS || !Number.isInteger(at) || at < 0 || at > t.cols) return t;
  const colWidths = [...t.colWidths];
  colWidths.splice(at, 0, DEFAULT_COL_WIDTH);
  return {
    rows: t.rows,
    cols: t.cols + 1,
    colWidths,
    rowHeights: [...t.rowHeights],
    cells: remapCells(t.cells, (r, c) => [r, c >= at ? c + 1 : c]),
  };
}

export function removeCol(t: TableSnapshot, at: number): TableSnapshot {
  if (t.cols <= 1 || !Number.isInteger(at) || at < 0 || at >= t.cols) return t;
  const colWidths = [...t.colWidths];
  colWidths.splice(at, 1);
  return {
    rows: t.rows,
    cols: t.cols - 1,
    colWidths,
    rowHeights: [...t.rowHeights],
    cells: remapCells(t.cells, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c])),
  };
}

/** Parses clipboard text from Excel/Sheets. Null when it has no tab (not tabular). */
export function parseTsv(text: string): string[][] | null {
  if (!text.includes("\t")) return null;
  let s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.endsWith("\n")) s = s.slice(0, -1);
  const rows = s.split("\n").map((line) => line.split("\t"));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => (r.length < width ? r.concat(Array(width - r.length).fill("")) : r));
}

/** Picks the `cell:<r>:<c>` entries out of a table's flattened Y.Map JSON. */
export function cellsOf(data: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("cell:") && typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}
