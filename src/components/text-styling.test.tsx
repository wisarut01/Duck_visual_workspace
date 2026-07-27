import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ElementToolbar } from "./Canvas";

afterEach(() => cleanup());

// F6 — bold/italic/underline toggle group + text-color swatches, added to
// ElementToolbar (shared with F3's color/thickness/fill groups). Shown for
// note/shape/text.
describe("ElementToolbar (F6 — bold/italic/underline/textColor)", () => {
  const baseProps = {
    x: 0,
    y: 0,
    fontSize: 14,
    fontFamily: "ui" as const,
    textAlign: "left" as const,
  };

  it("the Bold toggle calls onChange with { bold: true } when currently off", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="text" onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/bold/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bold: true }));
  });

  it("the Bold toggle calls onChange with { bold: false } when currently on", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="text" bold onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/bold/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bold: false }));
  });

  it("the Italic toggle calls onChange with { italic: true }", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="shape" onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/italic/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ italic: true }));
  });

  it("the Underline toggle calls onChange with { underline: true }", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="note" onChange={onChange} />);
    fireEvent.click(screen.getByTitle(/underline/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ underline: true }));
  });

  it("clicking a text-color swatch calls onChange with that textColor index", () => {
    const onChange = vi.fn();
    render(<ElementToolbar {...baseProps} kind="text" onChange={onChange} />);
    const swatches = screen.getAllByRole("button", { name: /^text color /i });
    expect(swatches.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(swatches[1]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ textColor: 1 }));
  });

  it("B/I/U and text-color groups are shown for note/shape/text alike", () => {
    const onChange = vi.fn();
    for (const kind of ["note", "shape", "text"] as const) {
      const { unmount } = render(<ElementToolbar {...baseProps} kind={kind} onChange={onChange} />);
      expect(screen.getByTitle(/bold/i)).toBeTruthy();
      unmount();
    }
  });
});
