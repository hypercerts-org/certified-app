import { type NextRequest, NextResponse } from "next/server";
import { hasAppSession, sessionCookie } from "@/lib/auth/session";
import { logError } from "@/lib/log";

// `/` decides before anything renders, so every visitor gets a real 307 and
// never sees one page flash before another: signed in, the workspace;
// otherwise the landing page. "Signed in" means the cookie still names a
// session (one Valkey read, only for `/`); a dead cookie (expired, revoked,
// from before a store change) goes to the landing page and is cleared. If
// Valkey can't answer, src/app/(site)/page.tsx decides instead.

const to = (path: string, request: NextRequest) =>
  NextResponse.redirect(new URL(path, request.url), 307);

export async function proxy(request: NextRequest) {
  try {
    const { name, options } = sessionCookie();
    const token = request.cookies.get(name)?.value;
    if (!token) return to("/welcome", request);
    if (await hasAppSession(token)) return to("/workspace", request);
    const response = to("/welcome", request);
    response.cookies.set(name, "", { ...options, maxAge: 0 });
    return response;
  } catch (err) {
    logError("[proxy] session check failed", err);
    return NextResponse.next(); // the page checks the session itself
  }
}

export const config = { matcher: "/" };
