import { ALLOWED_UPLOAD_MIME_TYPES } from "./uploads";

export const MAX_PASTE_CHARS = 5000;

export function normalizePastedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .trim()
    .slice(0, MAX_PASTE_CHARS);
}

export function pickPasteAction(data: { text: string; imageTypes: string[] }): "image" | "text" | "none" {
  // Text wins when both are present: Word/Excel put a bitmap rendering of
  // the copied text on the clipboard next to the text itself, and pasting a
  // picture of the words is never what was meant. A screenshot or a copied
  // image carries no text/plain, so it still lands here as an image.
  if (normalizePastedText(data.text) !== "") return "text";
  const allowed = ALLOWED_UPLOAD_MIME_TYPES as readonly string[];
  return data.imageTypes.some((t) => allowed.includes(t)) ? "image" : "none";
}
