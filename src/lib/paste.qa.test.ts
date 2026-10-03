// QA acceptance tests for clipboard paste helpers.
import { describe, it, expect } from "vitest";
import { MAX_PASTE_CHARS, normalizePastedText, pickPasteAction } from "./paste";
import { readBodyText } from "./body-text";

describe("QA: normalizePastedText", () => {
  it("normalises line endings", () => {
    expect(normalizePastedText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
  it("converts non-breaking spaces", () => {
    expect(normalizePastedText("a b")).toBe("a b");
  });
  it("trims the outside, keeps inner blank lines", () => {
    expect(normalizePastedText("\n\n  a\n\nb  \r\n")).toBe("a\n\nb");
  });
  it("whitespace-only becomes empty", () => {
    expect(normalizePastedText(" \r\n \t")).toBe("");
  });
  it("caps length", () => {
    expect(normalizePastedText("x".repeat(MAX_PASTE_CHARS + 500))).toHaveLength(MAX_PASTE_CHARS);
  });
  it("keeps Thai text intact", () => {
    expect(normalizePastedText("สวัสดี\r\nครับ")).toBe("สวัสดี\nครับ");
  });
});

describe("QA: pickPasteAction", () => {
  it("text only", () => {
    expect(pickPasteAction({ text: "hello", imageTypes: [] })).toBe("text");
  });
  it("text wins over an image rendition of it (Word/Excel)", () => {
    expect(pickPasteAction({ text: "hello", imageTypes: ["image/png"] })).toBe("text");
    expect(pickPasteAction({ text: "", imageTypes: ["image/png"] })).toBe("image");
  });
  it("unsupported image types fall back to text or none", () => {
    expect(pickPasteAction({ text: "hello", imageTypes: ["image/svg+xml"] })).toBe("text");
    expect(pickPasteAction({ text: "", imageTypes: ["image/svg+xml"] })).toBe("none");
  });
  it("blank text is none", () => {
    expect(pickPasteAction({ text: "  \n ", imageTypes: [] })).toBe("none");
  });
});

describe("QA: readBodyText", () => {
  function el(html: string) {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d;
  }
  it.each([
    ["", ""],
    ["plain", "plain"],
    ["a<br>b", "a\nb"],
    ["a<div>b</div><div>c</div>", "a\nb\nc"],
    ["a<div><br></div><div>b</div>", "a\n\nb"],
    ["<div>a</div><div>b</div>", "a\nb"],
    ["<p>a</p><p>b</p>", "a\nb"],
    ["a<b>b</b><i>c</i>", "abc"],
  ])("%j -> %j", (html, expected) => {
    expect(readBodyText(el(html))).toBe(expected);
  });
  it("keeps literal newlines in a text node", () => {
    const d = document.createElement("div");
    d.textContent = "x\ny";
    expect(readBodyText(d)).toBe("x\ny");
  });
});
