import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail, newId } from "@/lib/db";
import { hashPassword, publicUser, startSession } from "@/lib/auth";
import { USER_COLORS } from "@/lib/room";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const requestedColor = typeof body?.color === "string" ? body.color : "";
  const color = (USER_COLORS as readonly string[]).includes(requestedColor)
    ? requestedColor
    : USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const user = await createUser({
    id: newId(),
    email,
    name: name || email.split("@")[0],
    color,
    password_hash: hash,
    password_salt: salt,
  });
  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) }, { status: 201 });
}
