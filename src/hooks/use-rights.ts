"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * Loose shape of an `org.hypercerts.claim.rights` record. The lexicon's
 * required fields are `rightsName`, `rightsType`, `rightsDescription`,
 * `createdAt` — see `lexicons/org/hypercerts/claim/rights.json` in the
 * hypercerts-org/hypercerts-lexicon repo. We only render the
 * human-readable name here so the others are kept loosely typed.
 */
export interface RightsRecordValue {
  rightsName?: string
  rightsType?: string
  rightsDescription?: string
  [key: string]: unknown
}

// Module-level cache so multiple cert detail mounts in the same
// session share lookups. Keys are full at:// URIs.
const cache = createBoundedCache<string, Promise<RightsRecordValue | null>>()

function fetchRights(uri: string): Promise<RightsRecordValue | null> {
  const existing = cache.get(uri)
  if (existing) return existing

  const parsed = parseAtUri(uri)
  if (!parsed) return Promise.resolve(null)

  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })

  const p = authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { value?: RightsRecordValue } | null) => {
      if (!data || !data.value) return null
      return data.value
    })
    .catch(() => {
      cache.delete(uri)
      return null
    })

  cache.set(uri, p)
  return p
}

/**
 * Look up a rights record referenced from a cert via `value.rights`.
 * Returns `{ name, isLoading }`. `name` falls back through
 * `rightsName` → `rightsType` → null, mirroring how other badge/cert
 * records render when the human-readable label is missing.
 */
export function useRights(uri: string | null | undefined): {
  name: string | null
  isLoading: boolean
} {
  const [record, setRecord] = useState<RightsRecordValue | null>(null)
  const [isLoading, setIsLoading] = useState(!!uri)

  useEffect(() => {
    if (!uri) {
      setRecord(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    fetchRights(uri)
      .then((data) => {
        if (cancelled) return
        setRecord(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  const name =
    (typeof record?.rightsName === "string" && record.rightsName.length > 0
      ? record.rightsName
      : null) ??
    (typeof record?.rightsType === "string" && record.rightsType.length > 0
      ? record.rightsType
      : null)

  return { name, isLoading }
}
