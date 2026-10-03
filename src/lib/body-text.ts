// Reads the plain text of a contentEditable body with line breaks preserved.
// `textContent` drops <br> and the <div>/<p> wrappers browsers insert on
// Enter, and `innerText` isn't implemented in jsdom, so walk the tree.
//
// Model: `lines` holds finished lines, `cur` the line being built. A <br>
// finishes the current line; a block element finishes any non-empty open
// line on entry and exit. So `<div><br></div>` yields exactly one empty line
// (the <br> ends it, the block exit then has nothing open to flush).
const BLOCK_TAGS = new Set(["DIV", "P"]);

export function readBodyText(el: HTMLElement): string {
  const lines: string[] = [];
  let cur = "";

  const flushIfOpen = () => {
    if (cur !== "") {
      lines.push(cur);
      cur = "";
    }
  };

  const walk = (node: Node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        cur += child.nodeValue ?? "";
      } else if (child.nodeType === 1) {
        const tag = (child as Element).tagName;
        if (tag === "BR") {
          lines.push(cur);
          cur = "";
        } else if (BLOCK_TAGS.has(tag)) {
          flushIfOpen();
          walk(child);
          flushIfOpen();
        } else {
          walk(child);
        }
      }
    }
  };

  walk(el);
  if (cur !== "") lines.push(cur);
  return lines.join("\n");
}
