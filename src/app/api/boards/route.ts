import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listBoardsForOwner, upsertBoard } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ boards: await listBoardsForOwner(user.id) });
}

// Records a visit/rename — id comes from the client (board room ids are
// generated client-side, e.g. via randomRoomId() or a shared link).
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!id) return NextResponse.json({ error: "Board id required." }, { status: 400 });

  await upsertBoard(id, user.id, name || id);
  return NextResponse.json({ boards: await listBoardsForOwner(user.id) }, { status: 201 });
}
