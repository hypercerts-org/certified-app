import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent, getServiceAuthToken } from "@/lib/groups/proxy-agent"
import { GROUP_SERVICE } from "@/lib/groups/constants"
import { checkCsrf } from "@/lib/auth/csrf"
import { extractRouteError, parseJsonBody } from "@/lib/utils/api"
import { isValidDid } from "@/lib/utils/did"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"

// Same per-DID cap as register: importing is the privileged "promote an
// existing account into a group" write. Auth-gated, so RL keys off the
// session DID (no IP enforcement needed).
const LIMITER = makeLimiter("groups-import", 5, 600)

/**
 * POST /api/groups/import
 *
 * Promote the **currently authenticated account** into a group via
 * `app.certified.group.import` (the sibling of `register` that reuses an
 * existing account instead of creating a new one).
 *
 * CGS requires the service-auth JWT to be signed by the account being
 * imported (`iss` = the account's DID), so the imported `groupDid` is
 * always the authenticated user's DID — never taken from the body. The
 * caller supplies an app password for that account (stored encrypted by
 * CGS so it can act on the account's behalf) and the DID that becomes
 * the group owner (defaults to the importer).
 *
 * Unlike `register`, the service holds no recovery key for an imported
 * account — the owner's own credentials are their credible exit. The
 * account's DID document is not modified.
 *
 * Note: the `MAX_SELF_CREATED_ORGS` guardrail is enforced on `register`
 * but not yet on `import` (importing requires a real account + app
 * password, so the abuse surface is small). Tracked as a follow-up.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(LIMITER, auth.did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const parsed = await parseJsonBody(request, "[groups/import]")
    if (!parsed.ok) return parsed.response
    const { appPassword, ownerDid: rawOwnerDid } = (parsed.body ?? {}) as {
      appPassword?: string
      ownerDid?: string
    }

    if (!appPassword || typeof appPassword !== "string") {
      return NextResponse.json(
        { error: "appPassword is required" },
        { status: 400 },
      )
    }

    // The owner defaults to the importer. If supplied explicitly it must
    // be a valid DID; the importer can only confer ownership on a real
    // account.
    const ownerDid = rawOwnerDid ?? auth.did
    if (!isValidDid(ownerDid)) {
      return NextResponse.json({ error: "Invalid ownerDid" }, { status: 400 })
    }

    // groupDid is fixed to the authenticated account: CGS requires the
    // token's `iss` to equal the imported account, and our service-auth
    // is signed by the session DID.
    const groupDid = auth.did

    const token = await getServiceAuthToken(
      auth.agent,
      "app.certified.group.import",
    )

    const res = await fetch(
      `${GROUP_SERVICE}/xrpc/app.certified.group.import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ groupDid, appPassword, ownerDid }),
      },
    )

    if (!res.ok) {
      if (res.status >= 500) {
        return NextResponse.json({ error: "Import failed" }, { status: 502 })
      }
      // Forward structured XRPC errors (InvalidAppPassword,
      // GroupAlreadyRegistered, …) so the client can show field-level
      // messages.
      let errorCode: string | undefined
      let errorMessage = `Import failed: ${res.status}`
      try {
        const data = (await res.json()) as { error?: string; message?: string }
        if (typeof data.error === "string") errorCode = data.error
        if (typeof data.message === "string") errorMessage = data.message
        else if (errorCode) errorMessage = errorCode
      } catch (err) {
        logSafe("[groups/import] upstream non-JSON 4xx body", err, {
          status: res.status,
        })
      }
      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: res.status },
      )
    }

    const result = await res.json()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
