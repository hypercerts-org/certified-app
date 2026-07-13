"use client"

import { useEffect, useState } from "react"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import { rkeyFromUri } from "@/lib/urls"

export interface OwnCert {
  uri: string
  cid: string
  title: string
}

/**
 * "Your certs" quick-pick fetch shared by `/project/new` and the
 * project edit page. Fetches the author's own certs once via
 * `listRecords` on the active repo (the active group's DID when one is
 * selected, otherwise the passed personal `did`) so the quick-pick
 * checklist can render straight away — the source repo always matches
 * the publish target.
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
  const { activeOrg } = useOrg()
  const sourceDid = activeOrg ? activeOrg.groupDid : did
  const [ownCerts, setOwnCerts] = useState<OwnCert[]>([])
  // No source repo means no fetch — isLoading must be false then, not
  // stuck on a true initializer.
  const [isLoading, setIsLoading] = useState(!!sourceDid)

  // Adjust state during render when the source repo changes, so the
  // effect holds only the fetch lifecycle.
  const [prevSourceDid, setPrevSourceDid] = useState(sourceDid)
  if (prevSourceDid !== sourceDid) {
    setPrevSourceDid(sourceDid)
    setIsLoading(!!sourceDid)
  }

  useEffect(() => {
    if (!sourceDid) return
    const controller = new AbortController()
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
              : rkeyFromUri(rec.uri) || "(untitled activity)",
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
  }, [sourceDid])

  return { ownCerts, isLoading }
}
