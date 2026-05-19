import { authFetch } from "@/lib/auth/fetch"
import { extractError } from "@/lib/utils/api"

/**
 * Thrown when a `swapRecord` putRecord is rejected because the
 * record's CID at write time differs from the CID the caller
 * passed (i.e. someone else wrote between the caller's read and
 * write). Per the atproto spec, the upstream PDS returns HTTP
 * 400 with body `{error: "InvalidSwap", message: ...}` —
 * `writeToRepo` detects that shape and re-raises as this typed
 * error so save handlers can `instanceof`-check it.
 *
 * Caught by inline-edit save handlers to drive the conflict
 * rebase + drafts banner; uncaught everywhere else (the caller
 * should know whether they passed swapRecord). */
export class InvalidSwapError extends Error {
  readonly code = "InvalidSwap"
  constructor(message = "Record was modified") {
    super(message)
    this.name = "InvalidSwapError"
  }
}

/**
 * Single dual-path write seam shared by every helper that writes to a
 * repo on behalf of the viewer — `putCertRecord`, `putProjectRecord`,
 * `putLocationRecord`, `putProfile`, `putOrgMarker`, `createFollow`.
 *
 * Every one of those helpers has the same structural shape:
 *
 *   - When `targetDid === ownDid`, the viewer is editing their own
 *     repo → write through the XRPC proxy at
 *     `/api/xrpc/com/atproto/repo/{create,put,delete}Record`.
 *   - When `targetDid !== ownDid`, the viewer is acting as a group
 *     they admin → write through the group BFF route at
 *     `/api/groups/<targetDid>/<sub>`, which proxies via the user's
 *     OAuth session to the group's service auth.
 *
 * The two paths differ in URL, HTTP method, and body shape per the
 * route's contract — each helper still pre-shapes its own bodies.
 * What was duplicated is the fetch + error-handling boilerplate
 * around the routing decision: ~12 lines × 6 helpers ≈ 72 lines
 * collapsed to one call.
 *
 * @param req.ownPath - the XRPC-proxy request the helper would send
 *   when writing to the viewer's own repo.
 * @param req.groupPath - the BFF request the helper would send when
 *   writing on behalf of a group.
 * @param req.errorFallback - the user-facing error message used if
 *   the upstream returns a non-2xx and `extractError` can't find a
 *   `data.error` string to surface.
 *
 * @returns the parsed JSON response body cast to `T`. Callers whose
 *   route returns `{ uri, cid }` should pass that shape as `T`;
 *   void-result callers can pass `unknown` and discard.
 */
export interface DualPathWriteRequest {
  ownDid: string
  targetDid: string
  ownPath: {
    url: string
    method: "POST" | "PUT"
    body: unknown
  }
  groupPath: {
    url: string
    method: "POST" | "PUT"
    body: unknown
  }
  errorFallback: string
}

export async function writeToRepo<T>(
  req: DualPathWriteRequest,
): Promise<T> {
  const target =
    req.targetDid !== req.ownDid ? req.groupPath : req.ownPath
  const res = await authFetch(target.url, {
    method: target.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target.body),
  })
  if (!res.ok) {
    // Try to detect an InvalidSwap response and rethrow as the
    // typed error before falling back to a generic Error. The XRPC
    // proxy + the 5 group BFF routes both surface upstream PDS
    // errors with the discriminator in `data.code` (preserved
    // verbatim from the @atproto/api error body).
    if (res.status === 400) {
      try {
        const cloned = res.clone()
        const data = (await cloned.json()) as {
          code?: unknown
          error?: unknown
          message?: unknown
        }
        if (data.code === "InvalidSwap" || data.error === "InvalidSwap") {
          throw new InvalidSwapError(
            typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
              ? data.error
              : undefined,
          )
        }
      } catch (err) {
        if (err instanceof InvalidSwapError) throw err
        // Body wasn't JSON or didn't carry the discriminator —
        // fall through to the generic error path below.
      }
    }
    throw new Error(await extractError(res, req.errorFallback))
  }
  return (await res.json()) as T
}
