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
  const allowed = ALLOWED_UPLOAD_MIME_TYPES as readonly string[];
  if (data.imageTypes.some((t) => allowed.includes(t))) return "image";
  return normalizePastedText(data.text) !== "" ? "text" : "none";
}
