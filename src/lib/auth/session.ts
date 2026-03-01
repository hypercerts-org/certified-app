import { cookies } from "next/headers"
import { randomBytes, createHmac, timingSafeEqual } from "crypto"

const COOKIE_NAME = "certified_session"
const COOKIE_SECRET = process.env.COOKIE_SECRET
if (!COOKIE_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "COOKIE_SECRET environment variable is required in production. Generate one with: openssl rand -hex 32"
  )
}
const effectiveSecret = COOKIE_SECRET || "dev-secret-change-in-production"

// Map from session ID -> DID (the key used in NodeOAuthClient session store)
const sessionToDid = new Map<string, string>()

function sign(sessionId: string): string {
  return createHmac("sha256", effectiveSecret).update(sessionId).digest("hex")
}

export async function createSession(did: string): Promise<void> {
  // Invalidate any existing session for this DID (session rotation)
  for (const [existingSessionId, existingDid] of sessionToDid.entries()) {
    if (existingDid === did) {
      sessionToDid.delete(existingSessionId)
    }
  }

  const sessionId = randomBytes(32).toString("hex")
  const signature = sign(sessionId)
  const cookieValue = `${sessionId}.${signature}`

  sessionToDid.set(sessionId, did)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function getSessionDid(): Promise<string | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)
  if (!cookie) return null

  const dotIndex = cookie.value.lastIndexOf(".")
  if (dotIndex === -1) return null

  const sessionId = cookie.value.slice(0, dotIndex)
  const providedSignature = cookie.value.slice(dotIndex + 1)
  const expectedSignature = sign(sessionId)

  const providedBuf = Buffer.from(providedSignature, "hex")
  const expectedBuf = Buffer.from(expectedSignature, "hex")
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return null
  }

  return sessionToDid.get(sessionId) ?? null
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)

  if (cookie) {
    const dotIndex = cookie.value.lastIndexOf(".")
    if (dotIndex !== -1) {
      const sessionId = cookie.value.slice(0, dotIndex)
      sessionToDid.delete(sessionId)
    }
  }

  cookieStore.delete(COOKIE_NAME)
}
