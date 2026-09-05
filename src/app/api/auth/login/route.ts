import { NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const result = await loginUser(body?.email ?? "", body?.password ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
