import { describe, it, expect } from "vitest";
import { readBodyText } from "./body-text";

function el(html: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
}

describe("readBodyText", () => {
  it("empty -> empty string", () => expect(readBodyText(el(""))).toBe(""));
  it("br is newline", () => expect(readBodyText(el("a<br>b"))).toBe("a\nb"));
  it("div children start new lines", () => expect(readBodyText(el("a<div>b</div><div>c</div>"))).toBe("a\nb\nc"));
  it("div br is one empty line", () => expect(readBodyText(el("a<div><br></div><div>b</div>"))).toBe("a\n\nb"));
  it("keeps literal newlines in a text node", () => {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode("x\ny"));
    expect(readBodyText(d)).toBe("x\ny");
  });
  it("p is a block", () => expect(readBodyText(el("<p>a</p><p>b</p>"))).toBe("a\nb"));
  it("no trailing newline for trailing br", () => expect(readBodyText(el("a<br>"))).toBe("a"));
  it("inline elements do not break lines", () => expect(readBodyText(el("a<b>b</b>c"))).toBe("abc"));
  it("plain text", () => expect(readBodyText(el("hello"))).toBe("hello"));
});
