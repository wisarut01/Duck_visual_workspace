// New-feature tests for F5 (frame label + delete button, screen-space
// sized). See PLAN.md "F5". FrameItem is normally module-private in
// Canvas.tsx; PLAN.md explicitly asks for it to be exported for this test.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FrameItem } from "./Canvas";
import { createBoardDoc, addFrame, type FrameData } from "@/lib/board-doc";

function setup(viewS: number) {
  const board = createBoardDoc();
  const id = addFrame(board, 100, 100, 400, 300, "MY FRAME");
  const data = board.frames.get(id)!.toJSON() as FrameData;
  render(
    <FrameItem
      board={board}
      id={id}
      data={data}
      view={{ x: 0, y: 0, s: viewS }}
      selected={false}
      onSelect={() => {}}
      registerBody={() => {}}
      allNotes={[]}
      allShapes={[]}
      allTexts={[]}
      allArrows={[]}
    />,
  );
}

describe("FrameItem — F5 frame label + delete button", () => {
  afterEach(() => cleanup());

  it("renders the frame's label text", () => {
    setup(1);
    expect(screen.getByText("MY FRAME")).toBeTruthy();
  });

  it("counter-scales the label at zoom 0.5 (transform contains scale(2))", () => {
    setup(0.5);
    const label = screen.getByText("MY FRAME");
    expect(label.style.transform).toContain("scale(2)");
  });

  it("counter-scales the label at zoom 2 (transform contains scale(0.5))", () => {
    setup(2);
    const label = screen.getByText("MY FRAME");
    expect(label.style.transform).toContain("scale(0.5)");
  });

  it("anchors the label with a bottom-left transform-origin (frame's top-left corner stays pinned)", () => {
    setup(0.5);
    const label = screen.getByText("MY FRAME");
    expect(label.style.transformOrigin).toBe("0% 100%");
  });

  it("is a no-op scale(1) at zoom 1", () => {
    setup(1);
    const label = screen.getByText("MY FRAME");
    expect(label.style.transform).toContain("scale(1)");
  });

  it("renders a delete button that counter-scales too", () => {
    setup(0.5);
    const del = screen.getByRole("button");
    expect(del.style.transform).toContain("scale(2)");
  });

  it("anchors the delete button with a bottom-right transform-origin", () => {
    setup(0.5);
    const del = screen.getByRole("button");
    expect(del.style.transformOrigin).toBe("100% 100%");
  });
});
