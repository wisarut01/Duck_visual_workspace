import { describe, it, expect } from "vitest";
import { readImageDimensions } from "./image-dimensions";

// Minimal, syntactically valid headers for each format — just enough bytes
// for the parser to find width/height, not full valid files.
function pngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0); // signature
  const view = new DataView(buf.buffer);
  view.setUint32(8, 13); // IHDR chunk length
  buf.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

function gifHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10);
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  const view = new DataView(buf.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return buf;
}

function jpegHeader(width: number, height: number): Uint8Array {
  // SOI, SOF0 marker, length=11, precision=8, height, width, 1 component.
  const buf = new Uint8Array(21);
  buf.set([0xff, 0xd8, 0xff, 0xc0], 0);
  const view = new DataView(buf.buffer);
  view.setUint16(4, 11);
  buf[6] = 8; // precision
  view.setUint16(7, height);
  view.setUint16(9, width);
  buf[11] = 1; // numComponents
  buf.set([1, 0x11, 0], 12);
  return buf;
}

describe("image-dimensions.ts — server-side raster header parsing (F1a)", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    expect(readImageDimensions(pngHeader(600, 400), "image/png")).toEqual({ width: 600, height: 400 });
  });

  it("reads GIF width/height (little-endian)", () => {
    expect(readImageDimensions(gifHeader(320, 240), "image/gif")).toEqual({ width: 320, height: 240 });
  });

  it("reads JPEG width/height from the SOF0 marker", () => {
    expect(readImageDimensions(jpegHeader(800, 600), "image/jpeg")).toEqual({ width: 800, height: 600 });
  });

  it("returns null for webp (not parsed server-side — client measures on load instead)", () => {
    expect(readImageDimensions(new Uint8Array([0x52, 0x49, 0x46, 0x46]), "image/webp")).toBeNull();
  });

  it("returns null instead of throwing on a truncated/corrupt buffer", () => {
    expect(readImageDimensions(new Uint8Array([137, 80, 78]), "image/png")).toBeNull();
    expect(readImageDimensions(new Uint8Array([]), "image/jpeg")).toBeNull();
  });

  it("returns null for an unrecognized MIME type", () => {
    expect(readImageDimensions(pngHeader(10, 10), "application/octet-stream")).toBeNull();
  });
});
