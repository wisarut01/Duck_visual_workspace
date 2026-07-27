import { describe, it, expect } from "vitest";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, validateUpload } from "./uploads";

describe("uploads.ts — server-side upload validation (F1a)", () => {
  it("allows every raster type in the allowlist under the size cap", () => {
    for (const mime of ALLOWED_UPLOAD_MIME_TYPES) {
      expect(validateUpload({ mime, size: 1024 })).toEqual({ ok: true });
    }
  });

  it("rejects image/svg+xml explicitly — stored-XSS vector, raster only", () => {
    const result = validateUpload({ mime: "image/svg+xml", size: 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects a non-image MIME type", () => {
    const result = validateUpload({ mime: "application/pdf", size: 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects a file over the 5 MB cap", () => {
    const result = validateUpload({ mime: "image/png", size: MAX_UPLOAD_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it("accepts a file exactly at the cap", () => {
    expect(validateUpload({ mime: "image/png", size: MAX_UPLOAD_BYTES })).toEqual({ ok: true });
  });

  it("rejects an empty file", () => {
    const result = validateUpload({ mime: "image/png", size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
