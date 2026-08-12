import { resolvePdsUrl } from "./did"

/**
 * Fetch a single ATProto record server-side, unauthenticated, from the
 * repo's own PDS. This mirrors the `getCertsProfile` pattern in
 * `app/api/resolve-did/resolve-core.ts`: resolve the DID to its PDS, then
 * hit the public `com.atproto.repo.getRecord` XRPC directly so records for
 * users on any PDS in the network resolve (not just our own).
 *
 * Returns null on any failure (missing record, unreachable PDS, malformed
 * response) — callers fall back to generic metadata. Server-only: uses bare
 * `fetch`, no auth context, no React hooks.
 */
export async function getRecordServer<T = Record<string, unknown>>(
  did: string,
  collection: string,
  rkey: string,
): Promise<{ uri: string; cid?: string; value: T } | null> {
  try {
    const targetPds = await resolvePdsUrl(did)
    if (!targetPds) return null

    const params = new URLSearchParams({ repo: did, collection, rkey })
    const res = await fetch(
      `${targetPds}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
      { redirect: "error", signal: AbortSignal.timeout(8_000) },
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      uri?: string
      cid?: string
      value?: T
    }
    if (!data.value) return null
    return { uri: data.uri ?? "", cid: data.cid, value: data.value }
  } catch {
    return null
  }
}
