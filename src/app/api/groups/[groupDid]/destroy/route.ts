import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedAgent, getServiceAuthToken } from "@/lib/groups/proxy-agent"
import { GROUP_SERVICE } from "@/lib/groups/constants"
import { checkCsrf } from "@/lib/auth/csrf"
import { extractRouteError } from "@/lib/utils/api"
import { isValidDid } from "@/lib/utils/did"
import { logSafe } from "@/lib/utils/log-safe"
import { enforceRateLimit, makeLimiter } from "@/lib/auth/rate-limit"

const LIMITER = makeLimiter("groups-destroy", 5, 600)

/**
 * POST /api/groups/[groupDid]/destroy
 *
 * Remove a group from the group service via `app.certified.group.destroy`
 * (owner-only — CGS enforces the role). This deletes only the service's
 * record of the group (credentials, member index, per-group database);
 * the underlying PDS account is left intact and can be re-imported later
 * via `app.certified.group.import`.
 *
 * Direct service-auth call (not proxied), mirroring `register`/`import`.
 * `destroy` is a body-less procedure, so the target group is named by
 * `repo` on the querystring (new explicit-targeting form; `aud` = the
 * service DID via `getServiceAuthToken`). See CGS aud-migration.md.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupDid: string }> },
) {
  try {
    const { groupDid } = await params
    if (!isValidDid(groupDid)) {
      return NextResponse.json({ error: "Invalid group DID" }, { status: 400 })
    }

    const auth = await getAuthenticatedAgent()
    if (!auth)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rateDenied = await enforceRateLimit(LIMITER, auth.did)
    if (rateDenied) return rateDenied

    const csrfError = checkCsrf(request)
    if (csrfError) return csrfError

    const token = await getServiceAuthToken(
      auth.agent,
      "app.certified.group.destroy",
    )

    const url = new URL(`${GROUP_SERVICE}/xrpc/app.certified.group.destroy`)
    url.searchParams.set("repo", groupDid)

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      if (res.status >= 500) {
        return NextResponse.json(
          { error: "Failed to remove group" },
          { status: 502 },
        )
      }
      // Forward structured XRPC errors (e.g. GroupNotFound, or a 403 when
      // the caller isn't the owner) so the client can message precisely.
      let errorCode: string | undefined
      let errorMessage = `Failed to remove group: ${res.status}`
      try {
        const data = (await res.json()) as { error?: string; message?: string }
        if (typeof data.error === "string") errorCode = data.error
        if (typeof data.message === "string") errorMessage = data.message
        else if (errorCode) errorMessage = errorCode
      } catch (err) {
        logSafe("[groups/destroy] upstream non-JSON 4xx body", err, {
          status: res.status,
        })
      }
      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: res.status },
      )
    }

    const result = await res.json().catch(() => ({ groupDid }))
    return NextResponse.json(result)
  } catch (err: unknown) {
    const { status, message } = extractRouteError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
