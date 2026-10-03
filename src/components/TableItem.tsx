"use client";

import { useRef } from "react";
import styles from "./TableItem.module.css";
import {
  type BoardDoc,
  type TableData,
  setTableCell,
  tableInsertRow,
  tableRemoveRow,
  tableInsertCol,
  tableRemoveCol,
} from "@/lib/board-doc";
import { MAX_ROWS, MAX_COLS, cellKey, cellsOf, tableSize } from "@/lib/table";
import { toolbarStyle, screenPxToWorld } from "@/lib/screen-space";
import { useSimpleDrag, type Selection, type Tool, type ViewState } from "./Canvas";

const TOOLBAR_GAP_PX = 8;

export interface TableItemProps {
  board: BoardDoc;
  id: string;
  // The table's Y.Map flattened to JSON: the TableData fields plus one
  // `cell:<r>:<c>` string key per non-empty cell.
  data: TableData;
  view: ViewState;
  tool: Tool;
  selected: boolean;
  onSelect: (s: Selection) => void;
  onDelete: (sel: Selection) => void;
}

export default function TableItem({ board, id, data, view, tool, selected, onSelect, onDelete }: TableItemProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastCellRef = useRef<string | null>(null);

  // useSimpleDrag reconstructs a double-click from consecutive pointerdowns
  // (the native dblclick is suppressed by its preventDefault) and then calls
  // `bodyRef.current?.focus()`. A table has no single body — the cell to edit
  // is whichever one the pointer is over — so this shim forwards that focus()
  // to the cell recorded by our own onPointerDown wrapper below.
  const focusShim = useRef<HTMLElement | null>({
    focus: () => {
      const key = lastCellRef.current;
      if (!key) return;
      rootRef.current?.querySelector<HTMLElement>(`[data-cell="${key}"]`)?.focus();
    },
  } as unknown as HTMLElement);
  const drag = useSimpleDrag(board, board.tables, "table", id, data.x, data.y, view, tool, onSelect, focusShim);

  const cells = cellsOf(data);
  const { w, h } = tableSize(data);

  function cellAt(target: EventTarget | null): string | null {
    const el = (target as HTMLElement | null)?.closest?.("[data-cell]");
    return el ? el.getAttribute("data-cell") : null;
  }

  function focusCell(r: number, c: number) {
    rootRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = r * data.cols + c + (e.shiftKey ? -1 : 1);
      if (idx < 0 || idx >= data.rows * data.cols) return;
      // Focusing the next cell blurs this one, which saves it.
      focusCell(Math.floor(idx / data.cols), idx % data.cols);
    } else if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === "Escape") {
      (e.currentTarget as HTMLElement).blur();
    }
  }

  const rowTops: number[] = [];
  let acc = 0;
  for (const rh of data.rowHeights) {
    rowTops.push(acc);
    acc += rh;
  }
  const colLefts: number[] = [];
  acc = 0;
  for (const cw of data.colWidths) {
    colLefts.push(acc);
    acc += cw;
  }

  const gridCells: React.ReactNode[] = [];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      gridCells.push(
        <div
          key={`${r}:${c}`}
          data-cell={`${r}:${c}`}
          className={styles.cell}
          style={{ left: colLefts[c], top: rowTops[r], width: data.colWidths[c], height: data.rowHeights[r] }}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={(e) => onKeyDown(e, r, c)}
          onBlur={(e) => setTableCell(board, id, r, c, e.currentTarget.textContent ?? "")}
        >
          {cells[cellKey(r, c)] ?? ""}
        </div>,
      );
    }
  }

  const anchorStyle: React.CSSProperties = {
    position: "absolute",
    left: data.x,
    top: data.y - screenPxToWorld(TOOLBAR_GAP_PX, view.s),
    width: 0,
    height: 0,
  };

  return (
    <>
      <div
        ref={rootRef}
        className={`${styles.table} ${selected ? styles.selected : ""}`}
        style={{ left: data.x, top: data.y, width: w, height: h }}
        {...drag}
        onPointerDown={(e) => {
          const key = cellAt(e.target);
          // A pointerdown inside the cell that is already being edited must
          // reach the browser untouched (caret placement, text selection),
          // not be turned into a drag / re-select.
          if (key && document.activeElement === (e.target as HTMLElement).closest("[data-cell]")) {
            e.stopPropagation();
            return;
          }
          lastCellRef.current = key;
          drag.onPointerDown(e);
        }}
      >
        {gridCells}
      </div>
      {selected && (
        <div style={anchorStyle}>
          <div className={styles.toolbar} style={toolbarStyle(view.s)} onPointerDown={(e) => e.stopPropagation()}>
            <button title="Add row" disabled={data.rows >= MAX_ROWS} onClick={() => tableInsertRow(board, id, data.rows)}>
              +Row
            </button>
            <button title="Remove last row" disabled={data.rows <= 1} onClick={() => tableRemoveRow(board, id, data.rows - 1)}>
              −Row
            </button>
            <div className={styles.sep} />
            <button title="Add column" disabled={data.cols >= MAX_COLS} onClick={() => tableInsertCol(board, id, data.cols)}>
              +Col
            </button>
            <button title="Remove last column" disabled={data.cols <= 1} onClick={() => tableRemoveCol(board, id, data.cols - 1)}>
              −Col
            </button>
            <div className={styles.sep} />
            <button className={styles.danger} title="Delete table" onClick={() => onDelete({ kind: "table", id })}>
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}
