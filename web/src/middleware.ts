import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Redirects unauthenticated requests for /nurse pages to /login.
 * The session secret is read from the environment here (Edge runtime); the
 * `config` module is server-only and not imported in middleware.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSession(token, secret);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/nurse/:path*"],
};
