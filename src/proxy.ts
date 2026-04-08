import { NextRequest, NextResponse } from "next/server"

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("certified_session")

  if (!hasSession) {
    return NextResponse.redirect(new URL("/welcome", request.url), 307)
  }

  return NextResponse.next()
}

// Only the root route needs middleware-based redirect to /welcome.
// Other authenticated pages handle auth checks client-side via AuthProvider + AuthGuard.
export const config = {
  matcher: ["/"],
}
