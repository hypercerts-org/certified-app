"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"

export interface OwnCert {
  uri: string
  cid: string
  title: string
}

/**
 * "Your certs" quick-pick fetch shared by `/project/new` and the
 * project edit page. Fetches certs once via `listRecords` on the
 * passed `did` so the quick-pick checklist can render straight away.
 *
 * The `did` is the PICKED write target — the caller threads in whichever
 * identity the per-action `<PostingAs>` picker (or the record's own
 * owner, on edit) resolves to, so the quick-pick scopes to the repo the
 * new project will actually land in. It is NOT derived from
 * `activeOrg` here: act-as is read-scope only, and the write target is
 * per-action (default You). When `did` is null (signed-out / pre-auth)
 * the fetch is skipped.
 *
 * 50 is `listRecords`' default page size; it covers the typical use
 * case without pagination plumbing. The fetch is best-effort: on
 * failure the list stays empty (the caller still has the search
 * affordance) and no error is surfaced. Records are sorted newest-first
 * so the most recently authored certs land at the top.
 */
export function useOwnCerts(did: string | null): {
  ownCerts: OwnCert[]
  isLoading: boolean
} {
  const [ownCerts, setOwnCerts] = useState<OwnCert[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sourceDid = did
    if (!sourceDid) return
    const controller = new AbortController()
    setIsLoading(true)
    const params = new URLSearchParams({
      repo: sourceDid,
      collection: "org.hypercerts.claim.activity",
      limit: "50",
    })
    authFetch(
      `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`listRecords failed: ${res.status}`)
        const body = (await res.json()) as {
          records?: Array<{
            uri: string
            cid: string
            value?: { title?: unknown; createdAt?: unknown }
          }>
        }
        const records = (body.records ?? []).map((rec) => ({
          uri: rec.uri,
          cid: rec.cid,
          title:
            typeof rec.value?.title === "string" && rec.value.title.trim()
              ? rec.value.title.trim()
              : rec.uri.split("/").pop() ?? "(untitled activity)",
          createdAt:
            typeof rec.value?.createdAt === "string"
              ? rec.value.createdAt
              : "",
        }))
        // Newest first so the most recently authored certs land at the
        // top of the list — closest to what the user expects to see
        // when they open the project form right after writing a cert.
        records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setOwnCerts(
          records.map(({ uri, cid, title }) => ({ uri, cid, title })),
        )
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        // Silently — quick-pick is best-effort; the user can still use
        // the search typeahead to find their certs.
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [did])

  return { ownCerts, isLoading }
}
