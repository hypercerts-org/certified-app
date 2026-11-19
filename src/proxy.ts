import { type NextRequest, NextResponse } from "next/server";

// `/` for a visitor without a session cookie: a real 307 to the landing page
// before anything renders (a redirect from a streamed page is a 200 with a
// meta refresh), which is what crawlers and new visitors get. With a cookie,
// src/app/(site)/page.tsx decides: the cookie may be stale (expired, revoked,
// or from before a store change), so only the session itself can say whether
// to open the workspace or the landing page.
const SESSION_COOKIES = ["__Host-certified_session", "certified_session"];

export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
  return NextResponse.redirect(new URL("/welcome", request.url), 307);
}

export const config = { matcher: "/" };
