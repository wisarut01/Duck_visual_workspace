import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import TableItem from "./TableItem";
import { createBoardDoc, addTable, readTable, type TableData } from "@/lib/board-doc";

afterEach(cleanup);

function setup(selected = true) {
  const board = createBoardDoc();
  const id = addTable(board, 10, 20, 2, 3);
  const data = board.tables.get(id)!.toJSON() as TableData;
  const onDelete = vi.fn();
  const el = (d: TableData) => (
    <TableItem
      board={board}
      id={id}
      data={d}
      view={{ x: 0, y: 0, s: 1 }}
      tool="select"
      selected={selected}
      onSelect={() => {}}
      onDelete={onDelete}
    />
  );
  const utils = render(el(data));
  // Mirrors Canvas, which re-renders with fresh data after every Y.Doc change.
  const refresh = () => utils.rerender(el(board.tables.get(id)!.toJSON() as TableData));
  const cell = (r: number, c: number) => utils.container.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)!;
  return { board, id, onDelete, cell, refresh, ...utils };
}

describe("TableItem", () => {
  it("renders rows x cols cells", () => {
    const { container } = setup();
    expect(container.querySelectorAll("[data-cell]").length).toBe(6);
  });

  it("saves cell text on blur", () => {
    const { board, id, cell } = setup();
    const el = cell(1, 2);
    el.textContent = "hi";
    fireEvent.blur(el);
    expect(readTable(board, id)!.cells).toEqual({ "cell:1:2": "hi" });
  });

  it("Tab / Shift+Tab move to next / previous cell", () => {
    const { cell } = setup();
    cell(0, 0).focus();
    fireEvent.keyDown(cell(0, 0), { key: "Tab" });
    expect(document.activeElement).toBe(cell(0, 1));
    fireEvent.keyDown(cell(0, 1), { key: "Tab" });
    fireEvent.keyDown(cell(0, 2), { key: "Tab" });
    expect(document.activeElement).toBe(cell(1, 0));
    fireEvent.keyDown(cell(1, 0), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cell(0, 2));
  });

  it("selected toolbar adds/removes rows and columns and routes delete through onDelete", () => {
    const { board, id, onDelete, getByTitle, refresh } = setup();
    fireEvent.click(getByTitle("Add row"));
    refresh();
    expect(readTable(board, id)!.rows).toBe(3);
    fireEvent.click(getByTitle("Remove last row"));
    refresh();
    expect(readTable(board, id)!.rows).toBe(2);
    fireEvent.click(getByTitle("Add column"));
    refresh();
    expect(readTable(board, id)!.cols).toBe(4);
    fireEvent.click(getByTitle("Remove last column"));
    refresh();
    expect(readTable(board, id)!.cols).toBe(3);
    fireEvent.click(getByTitle("Delete table"));
    expect(onDelete).toHaveBeenCalledWith({ kind: "table", id });
  });

  it("no toolbar when not selected", () => {
    const { queryByTitle } = setup(false);
    expect(queryByTitle("Add row")).toBeNull();
  });
});
