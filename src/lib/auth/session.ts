import { cookies } from "next/headers"
import { randomBytes, createHmac } from "crypto"

const COOKIE_NAME = "certified_session"
const COOKIE_SECRET =
  process.env.COOKIE_SECRET || "dev-secret-change-in-production"

// Map from session ID → DID (the key used in NodeOAuthClient session store)
const sessionToDid = new Map<string, string>()

function sign(sessionId: string): string {
  return createHmac("sha256", COOKIE_SECRET).update(sessionId).digest("hex")
}

export async function createSession(did: string): Promise<void> {
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

  if (providedSignature !== expectedSignature) return null

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
