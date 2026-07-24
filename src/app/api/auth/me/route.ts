import { NextRequest, NextResponse } from "next/server";
import { currentUser, publicUser } from "@/lib/auth";
import { updateUserProfile, getUserById } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "";
  if (!name || !color) {
    return NextResponse.json({ error: "Name and color are required." }, { status: 400 });
  }

  await updateUserProfile(user.id, name, color);
  const updated = (await getUserById(user.id))!;
  return NextResponse.json({ user: publicUser(updated) });
}
