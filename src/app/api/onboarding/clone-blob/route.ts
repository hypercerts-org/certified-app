import { NextRequest, NextResponse } from "next/server"
import { Agent } from "@atproto/api"
import { checkCsrf } from "@/lib/auth/csrf"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { parseJsonBody } from "@/lib/utils/api"
import { logSafe } from "@/lib/utils/log-safe"

/**
 * Clone a blob from an external (Bluesky CDN) URL into the
 * authenticated user's certified PDS. Used by the first-signin
 * onboarding flow to re-host the bsky-seeded avatar/banner inside
 * the user's own repo so it survives bsky CDN evictions.
 *
 * Why server-side: the bytes are public, but the upload to the PDS
 * is authenticated (uses the user's OAuth session). Doing the fetch
 * server-side also dodges CORS issues with bsky CDN responses and
 * lets us anti-SSRF the source URL host before we make the
 * outbound request.
 *
 * Anti-SSRF: only `cdn.bsky.app` is allowed as the source host. No
 * redirects are followed. This route is the only path the modal
 * uses to copy bsky imagery — if you need to clone from elsewhere,
 * add the host to ALLOWED_SOURCE_HOSTS explicitly.
 */

const ALLOWED_SOURCE_HOSTS = new Set<string>(["cdn.bsky.app"])
const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])
const MAX_BLOB_SIZE = 4 * 1024 * 1024 // 4MB — matches the avatar/banner
                                       // limits in lib/atproto/profile.ts
                                       // and Vercel's serverless body cap.
const FETCH_TIMEOUT_MS = 15_000

export async function POST(request: NextRequest) {
  const csrfError = checkCsrf(request)
  if (csrfError) return csrfError

  try {
    const did = await getSessionDid()
    if (!did) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const parsed = await parseJsonBody(request, "[onboarding/clone-blob]")
    if (!parsed.ok) return parsed.response
    const body = (parsed.body ?? {}) as { sourceUrl?: unknown }
    const sourceUrl =
      typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : ""
    if (!sourceUrl) {
      return NextResponse.json(
        { error: "sourceUrl is required" },
        { status: 400 },
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(sourceUrl)
    } catch {
      return NextResponse.json({ error: "Invalid sourceUrl" }, { status: 400 })
    }
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "sourceUrl must be https://" },
        { status: 400 },
      )
    }
    if (!ALLOWED_SOURCE_HOSTS.has(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: `sourceUrl host not allowed: ${parsedUrl.hostname}` },
        { status: 400 },
      )
    }

    // Fetch the source bytes. `redirect: "error"` keeps the
    // anti-SSRF guarantee — a 30x to an internal host would
    // otherwise sneak past the host allowlist.
    let sourceRes: Response
    try {
      sourceRes = await fetch(parsedUrl.toString(), {
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (err) {
      logSafe("[onboarding/clone-blob] source fetch failed", err)
      return NextResponse.json(
        { error: "Failed to fetch source URL" },
        { status: 502 },
      )
    }
    if (!sourceRes.ok) {
      return NextResponse.json(
        { error: `Source returned ${sourceRes.status}` },
        { status: 502 },
      )
    }

    const sourceContentType = (
      sourceRes.headers.get("content-type") || ""
    ).split(";")[0].trim().toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(sourceContentType)) {
      return NextResponse.json(
        { error: `Source mime not allowed: ${sourceContentType || "unknown"}` },
        { status: 415 },
      )
    }

    const sourceBuffer = await sourceRes.arrayBuffer()
    if (sourceBuffer.byteLength > MAX_BLOB_SIZE) {
      return NextResponse.json(
        { error: "Source larger than 4MB" },
        { status: 413 },
      )
    }

    // Restore the OAuth session and upload the bytes to the user's
    // PDS via the same Agent path the /api/xrpc proxy uses.
    const client = await getOAuthClient()
    let oauthSession
    try {
      oauthSession = await client.restore(did)
    } catch (err) {
      logSafe("[onboarding/clone-blob] oauth restore failed", err)
      await deleteSession()
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }
    const agent = new Agent(oauthSession)
    const uploadResult = await agent.com.atproto.repo.uploadBlob(
      new Uint8Array(sourceBuffer),
      { encoding: sourceContentType },
    )

    return NextResponse.json({ blob: uploadResult.data.blob })
  } catch (err) {
    logSafe("[onboarding/clone-blob] error", err)
    return NextResponse.json(
      { error: "Failed to clone blob" },
      { status: 500 },
    )
  }
}
