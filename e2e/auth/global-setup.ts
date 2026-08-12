import { createHmac, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Redis } from "@upstash/redis"

/**
 * Tier 3 global setup — mint a session cookie for a dedicated test DID.
 *
 * WHY THIS SHAPE. certified-app has no password grant: sign-in is atproto
 * OAuth against the ePDS with an emailed OTP typed on the ePDS's own
 * origin, so it cannot be driven headlessly (see AGENTS.md §27). But the
 * two halves of a session are stored independently:
 *
 *   - `certified_session` cookie = `${sessionId}.${hmac(sessionId, COOKIE_SECRET)}`,
 *     and `session:did:{sessionId}` in Redis maps it to a DID;
 *   - the OAuth tokens live at `oauth:session:{did}`, keyed ONLY by DID,
 *     with a 30-day TTL.
 *
 * So one interactive login for the test account populates the OAuth half
 * for 30 days, and this setup mints the cookie half fresh on every run.
 * No credential ever has to be handed to CI or to a test author.
 *
 * NO-OP WITHOUT CONFIG. When `E2E_TEST_DID` is absent this writes an
 * empty storage state and returns, so Tiers 1-2 run unchanged on forks
 * and in secret-less CI. Specs that need a session call
 * `requiresSession()` and skip themselves.
 */

const AUTH_DIR = join(process.cwd(), "e2e", ".auth")
export const STORAGE_STATE = join(AUTH_DIR, "state.json")

const SESSION_COOKIE = "certified_session"
const SESSION_DID_PREFIX = "session:did:"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

/**
 * Minimal .env parser so this file needs no dotenv dependency. Only
 * `KEY=value` lines; existing process.env always wins.
 */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function writeStorageState(cookies: unknown[]) {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  writeFileSync(
    STORAGE_STATE,
    JSON.stringify({ cookies, origins: [] }, null, 2),
    "utf8",
  )
}

export default async function globalSetup() {
  // `.env.test.local` matches the gitignored `.env*.local` pattern.
  loadEnvFile(join(process.cwd(), ".env.test.local"))

  const did = process.env.E2E_TEST_DID
  if (!did) {
    // Credential-free run: tiers 1-2 only.
    writeStorageState([])
    return
  }

  const cookieSecret = process.env.COOKIE_SECRET
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  const missing = [
    !cookieSecret && "COOKIE_SECRET",
    !redisUrl && "UPSTASH_REDIS_REST_URL",
    !redisToken && "UPSTASH_REDIS_REST_TOKEN",
  ].filter(Boolean)

  if (missing.length > 0) {
    // Fail loudly: E2E_TEST_DID was set deliberately, so a half-configured
    // run is a mistake, not a reason to silently skip.
    throw new Error(
      `E2E_TEST_DID is set but ${missing.join(", ")} ${
        missing.length === 1 ? "is" : "are"
      } missing. Add to .env.test.local (gitignored) or the CI secrets.`,
    )
  }

  if (!did.startsWith("did:")) {
    throw new Error(`E2E_TEST_DID must be a DID, got: ${did}`)
  }

  // Mint the cookie half, mirroring createSession() in src/lib/auth/session.ts.
  const sessionId = randomBytes(32).toString("hex")
  const signature = createHmac("sha256", cookieSecret!)
    .update(sessionId)
    .digest("hex")

  const redis = new Redis({ url: redisUrl!, token: redisToken! })
  await redis.set(`${SESSION_DID_PREFIX}${sessionId}`, did, {
    ex: SESSION_TTL_SECONDS,
  })

  const baseUrl = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000")

  writeStorageState([
    {
      name: SESSION_COOKIE,
      value: `${sessionId}.${signature}`,
      domain: baseUrl.hostname,
      path: "/",
      // Session TTL in seconds since epoch.
      expires: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      httpOnly: true,
      // `secure` is set only in production by the app; match the origin.
      secure: baseUrl.protocol === "https:",
      sameSite: "Lax" as const,
    },
  ])
}
