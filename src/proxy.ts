import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PAGES = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);

/**
 * Pages are closed to logged-out visitors by default, including new ones.
 * This only sees that a cookie exists, so each page and route still checks the real session and role.
 */
export function proxy(request: NextRequest) {
  if (PUBLIC_PAGES.has(request.nextUrl.pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
