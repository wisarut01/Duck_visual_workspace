// F1a: POST /api/uploads — multipart image upload, mirrors the session
// handling of the other routes in src/app/api/ (currentUser() from
// src/lib/auth.ts). Storage decision (see board-doc.ts's ImageData comment):
// only the returned Supabase Storage public URL ever goes in the Y.Doc.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { currentUser } from "@/lib/auth";
import { uploadBoardImage } from "@/lib/db";
import { validateUpload, type AllowedUploadMime } from "@/lib/uploads";
import { readImageDimensions } from "@/lib/image-dimensions";

const EXT_BY_MIME: Record<AllowedUploadMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  // The app otherwise allows anonymous board joining (see JoinCard) — no
  // account needed to open or edit a board. Uploads are the one exception:
  // an unauthenticated upload endpoint would make the Storage bucket an
  // open file host for anyone with the URL, so this requires a session.
  // The image toolbar button shows a "sign in to add images" hint to guests
  // rather than letting them hit this route and get a 401.
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to add images." }, { status: 401 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const mime = file.type;
  const validation = validateUpload({ mime, size: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dims = readImageDimensions(bytes, mime);

  const ext = EXT_BY_MIME[mime as AllowedUploadMime] ?? "bin";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  let url: string;
  try {
    url = await uploadBoardImage(path, bytes, mime);
  } catch (err) {
    console.error("uploadBoardImage failed", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({ url, width: dims?.width ?? null, height: dims?.height ?? null }, { status: 201 });
}
