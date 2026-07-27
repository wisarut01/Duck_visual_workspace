import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ElementToolbar, ConnectorToolbar } from "./Canvas";

afterEach(() => cleanup());

// F4 — on-canvas delete button, mobile has no Backspace key. Added to the
// shared ElementToolbar (every note/shape/text) and to ConnectorToolbar
// (arrows), both wired to the same onDelete callback Canvas passes down
// (which itself calls the extracted deleteSelection()).
describe("delete button (F4)", () => {
  it("ElementToolbar's delete button calls onDelete exactly once", () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <ElementToolbar
        x={0}
        y={0}
        fontSize={14}
        fontFamily="ui"
        textAlign="left"
        kind="text"
        onChange={onChange}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTitle(/delete/i));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("ConnectorToolbar's delete button calls onDelete exactly once", () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <svg>
        <ConnectorToolbar
          x={0}
          y={0}
          routing="straight"
          strokeWidth={2.5}
          headStart="none"
          headEnd="arrow"
          onChange={onChange}
          onDelete={onDelete}
        />
      </svg>,
    );
    fireEvent.click(screen.getByTitle(/delete/i));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
