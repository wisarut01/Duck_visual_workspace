// F1a: pure validation rules for POST /api/uploads, kept out of the route
// handler so they're testable without a Request/FormData mock and so both
// the API route and (if ever needed) a client-side pre-check can share the
// exact same rules.
//
// SVG is deliberately excluded: an uploaded SVG served back from a public
// Storage URL is a stored-XSS vector the moment anything renders it inline
// (an <img> tag alone is technically safe, but SVG is excluded outright per
// PLAN.md so no future caller can introduce that risk by accident) — raster
// only.
export const ALLOWED_UPLOAD_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadValidation = { ok: true } | { ok: false; status: 400 | 413 | 415; error: string };

export function validateUpload(file: { mime: string; size: number }): UploadValidation {
  if (!file.size || file.size <= 0) {
    return { ok: false, status: 400, error: "Empty file." };
  }
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.mime)) {
    return { ok: false, status: 415, error: "Only PNG, JPEG, GIF, or WebP images are allowed." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "Images must be 5 MB or smaller." };
  }
  return { ok: true };
}
