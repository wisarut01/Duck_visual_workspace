import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import { publicUser, startSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = email ? await getUserByEmail(email) : undefined;
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await startSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
