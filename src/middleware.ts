import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("certified_session")

  if (!hasSession) {
    return NextResponse.redirect(new URL("/welcome", request.url), 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/"],
}
