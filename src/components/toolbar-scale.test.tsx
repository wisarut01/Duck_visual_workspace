// New-feature test for F2 (screen-space toolbars). Per PLAN.md's own note:
// FontToolbar is module-private in Canvas.tsx, so rather than exporting the
// component (a bigger API change) this exercises the small `toolbarStyle`
// helper Canvas.tsx's FontToolbar/ConnectorToolbar are wired to use — that's
// the thing that actually decides the inline `transform` at a given zoom.
import { describe, it, expect } from "vitest";
import { toolbarStyle } from "@/lib/screen-space";

describe("toolbar-scale (F2 — FontToolbar/ConnectorToolbar counter-scale)", () => {
  it("at zoom 0.5, the toolbar's inline transform contains scale(2)", () => {
    const style = toolbarStyle(0.5);
    expect(style.transform).toContain("scale(2)");
  });

  it("at zoom 2, the toolbar's inline transform contains scale(0.5)", () => {
    const style = toolbarStyle(2);
    expect(style.transform).toContain("scale(0.5)");
  });

  it("at zoom 1, the toolbar's inline transform is a no-op scale(1)", () => {
    const style = toolbarStyle(1);
    expect(style.transform).toContain("scale(1)");
  });
});
