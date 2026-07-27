import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ElementToolbar } from "./Canvas";

afterEach(() => cleanup());

// F3 — shape color + border thickness + fill toggle, added to the renamed
// ElementToolbar (was FontToolbar). Color swatches are shown for note+shape;
// thickness + fill toggle are shape-only.
describe("ElementToolbar (F3 — color / thickness / fill)", () => {
  const baseProps = {
    x: 0,
    y: 0,
    zoom: 1,
    fontSize: 14,
    fontFamily: "ui" as const,
    textAlign: "left" as const,
  };

  it("shows 6 color swatches for a shape and clicking swatch #3 calls onChange with { color: 3 }", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="shape" color={0} strokeWidth={2.5} filled onChange={onChange} />);
    const swatches = screen.getAllByRole("button", { name: /^color /i });
    expect(swatches.length).toBe(6);
    fireEvent.click(swatches[3]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: 3 }));
  });

  it("shows color swatches for a note too", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="note" color={0} onChange={onChange} />);
    const swatches = screen.getAllByRole("button", { name: /^color /i });
    expect(swatches.length).toBe(6);
  });

  it("does not show color swatches for text", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="text" onChange={onChange} />);
    const swatches = screen.queryAllByRole("button", { name: /^color /i });
    expect(swatches.length).toBe(0);
  });

  it("clicking a thickness preset calls onChange with that strokeWidth (shape only)", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="shape" color={0} strokeWidth={2.5} filled onChange={onChange} />);
    const thickBtn = screen.getByTitle("6.5px");
    fireEvent.click(thickBtn);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ strokeWidth: 6.5 }));
  });

  it("thickness presets are not shown for note/text", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="note" color={0} onChange={onChange} />);
    expect(screen.queryByTitle("6.5px")).toBeNull();
  });

  it("clicking the fill toggle calls onChange with { filled: false } when currently filled", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="shape" color={0} strokeWidth={2.5} filled onChange={onChange} />);
    const fillBtn = screen.getByTitle(/outline/i);
    fireEvent.click(fillBtn);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ filled: false }));
  });
});
