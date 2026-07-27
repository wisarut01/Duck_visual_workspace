// F1a: reads pixel width/height straight out of a raster file's header
// bytes, server-side, without decoding the whole image (no image-processing
// dependency). Used by POST /api/uploads so ImageData.naturalW/naturalH can
// be filled in from the same bytes already being uploaded.
//
// Covers PNG/GIF/JPEG, the three simplest header formats. WebP's container
// (RIFF, with three different sub-formats — VP8/VP8L/VP8X — each with its
// own bit-packed dimension encoding) was judged not worth the added
// complexity/risk for this pass: returning null here is a safe fallback,
// since the client always has a second source of truth — the <img> element
// used to render the upload reports naturalWidth/naturalHeight once loaded,
// and the upload flow uses that when this returns null.
export interface Dimensions {
  width: number;
  height: number;
}

function readPng(buf: Uint8Array): Dimensions | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (buf.length < 24) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const isIHDR = buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52;
  if (!isIHDR) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height) return null;
  return { width, height };
}

function readGif(buf: Uint8Array): Dimensions | null {
  // "GIF87a" or "GIF89a" (6) + width (2 LE) + height (2 LE).
  if (buf.length < 10) return null;
  const isGif =
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61;
  if (!isGif) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  if (!width || !height) return null;
  return { width, height };
}

function readJpeg(buf: Uint8Array): Dimensions | null {
  // Scan markers for a Start-Of-Frame segment (SOF0..SOF15, excluding the
  // DHT/JPG-extension marker codes 0xC4/0xC8/0xCC) and read its
  // height/width fields.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null; // not a marker where one was expected
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const segmentLength = view.getUint16(offset + 2);
    if (isSOF) {
      if (offset + 9 > buf.length) return null;
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

export function readImageDimensions(buf: Uint8Array, mime: string): Dimensions | null {
  try {
    switch (mime) {
      case "image/png":
        return readPng(buf);
      case "image/gif":
        return readGif(buf);
      case "image/jpeg":
        return readJpeg(buf);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Magic-byte check that the actual bytes match the *claimed* MIME type.
 *
 * `POST /api/uploads` gets its MIME from `File.type`, which is
 * client-supplied and trivially spoofable — without this, a signed-in user
 * could store arbitrary bytes in the public bucket under an image
 * content-type. The PNG/GIF/JPEG readers above already return null when the
 * signature doesn't match, so they double as the check; WebP has no reader
 * (see the module comment), so its RIFF....WEBP container header is matched
 * directly here.
 *
 * Returns false only for a definite mismatch — an unrecognized MIME can't
 * reach here, since the route validates against the allowlist first.
 */
export function bytesMatchMime(buf: Uint8Array, mime: string): boolean {
  switch (mime) {
    case "image/png":
    case "image/gif":
    case "image/jpeg":
      return readImageDimensions(buf, mime) !== null;
    case "image/webp": {
      if (buf.length < 12) return false;
      const tag = (at: number, s: string) => s.split("").every((ch, i) => buf[at + i] === ch.charCodeAt(0));
      return tag(0, "RIFF") && tag(8, "WEBP");
    }
    default:
      return false;
  }
}
