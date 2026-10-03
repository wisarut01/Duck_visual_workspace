import { describe, it, expect } from "vitest";
import { MAX_PASTE_CHARS, normalizePastedText, pickPasteAction } from "./paste";
import { ALLOWED_UPLOAD_MIME_TYPES } from "./uploads";

describe("normalizePastedText", () => {
  it("converts CRLF and lone CR to LF", () => {
    expect(normalizePastedText("a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("converts nbsp to space", () => {
    expect(normalizePastedText("a b")).toBe("a b");
  });
  it("trims outer whitespace but keeps inner newlines", () => {
    expect(normalizePastedText("  \n a\n\nb \n ")).toBe("a\n\nb");
  });
  it("truncates to MAX_PASTE_CHARS", () => {
    expect(MAX_PASTE_CHARS).toBe(5000);
    expect(normalizePastedText("x".repeat(6000))).toHaveLength(5000);
  });
  it("returns empty for whitespace only", () => {
    expect(normalizePastedText(" \r\n  ")).toBe("");
  });
});

describe("pickPasteAction", () => {
  it("picks image for every allowed mime", () => {
    for (const t of ALLOWED_UPLOAD_MIME_TYPES) {
      expect(pickPasteAction({ text: "", imageTypes: [t] })).toBe("image");
    }
  });
  it("text wins over an image rendition of it", () => {
    expect(pickPasteAction({ text: "hello", imageTypes: ["image/png"] })).toBe("text");
  });
  it("ignores disallowed image types", () => {
    expect(pickPasteAction({ text: "hi", imageTypes: ["image/svg+xml"] })).toBe("text");
    expect(pickPasteAction({ text: "", imageTypes: ["image/svg+xml"] })).toBe("none");
  });
  it("text when non-empty after normalising", () => {
    expect(pickPasteAction({ text: " hi ", imageTypes: [] })).toBe("text");
  });
  it("none when whitespace only", () => {
    expect(pickPasteAction({ text: " \n ", imageTypes: [] })).toBe("none");
  });
});
