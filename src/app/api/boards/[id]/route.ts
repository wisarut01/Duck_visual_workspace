import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { deleteBoard, listBoardsForOwner } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  deleteBoard(id, user.id);
  return NextResponse.json({ boards: listBoardsForOwner(user.id) });
}
