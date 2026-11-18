import { type NextRequest, NextResponse } from "next/server";

// `/` sends a visitor on before anything renders, so browsers and crawlers
// get a real 307 (a redirect from a streamed page is a 200 with a meta
// refresh): to the workspace with a session cookie, otherwise to the landing
// page. The cookie's presence is enough to choose; the workspace checks the
// session itself and sends a stale one to sign in. (src/app/(site)/page.tsx
// does the same if this doesn't run.)
const SESSION_COOKIES = ["__Host-certified_session", "certified_session"];

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  return NextResponse.redirect(new URL(signedIn ? "/workspace" : "/welcome", request.url), 307);
}

export const config = { matcher: "/" };
