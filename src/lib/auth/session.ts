import { cookies } from "next/headers"
import { randomBytes, createHmac, timingSafeEqual } from "crypto"
import { getRedis } from "./stores"

const COOKIE_NAME = "certified_session"
const COOKIE_SECRET = process.env.COOKIE_SECRET
if (!COOKIE_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "COOKIE_SECRET environment variable is required in production. Generate one with: openssl rand -hex 32"
  )
}
const effectiveSecret = COOKIE_SECRET || "dev-secret-change-in-production"

const SESSION_DID_PREFIX = "session:did:"
const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days in seconds

function sign(sessionId: string): string {
  return createHmac("sha256", effectiveSecret).update(sessionId).digest("hex")
}

export async function createSession(did: string): Promise<void> {
  // Note: we don't scan/invalidate old sessions for this DID in Redis
  // because scanning is expensive. The old session cookie on the client
  // will simply be overwritten, and the orphaned Redis key will expire
  // via TTL.

  const sessionId = randomBytes(32).toString("hex")
  const signature = sign(sessionId)
  const cookieValue = `${sessionId}.${signature}`

  // Store session-to-DID mapping in Redis
  const redis = getRedis()
  await redis.set(`${SESSION_DID_PREFIX}${sessionId}`, did, {
    ex: SESSION_TTL,
  })

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
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

  const redis = getRedis()
  const did = await redis.get<string>(`${SESSION_DID_PREFIX}${sessionId}`)
  return did ?? null
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)

  if (cookie) {
    const dotIndex = cookie.value.lastIndexOf(".")
    if (dotIndex !== -1) {
      const sessionId = cookie.value.slice(0, dotIndex)
      const redis = getRedis()
      await redis.del(`${SESSION_DID_PREFIX}${sessionId}`)
    }
  }

  cookieStore.delete(COOKIE_NAME)
}
