import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSessionToken(token) : null;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/inbox") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/inbox/:path*", "/login", "/register"],
};
