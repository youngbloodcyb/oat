import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // `eve` routes authenticate through the agent's own channel policy.
  matcher: [
    "/((?!api|eve|login|\\.well-known/workflow|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
