"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { rkeyFromUri } from "@/lib/urls"
import type { StrongRef } from "@/lib/atproto/location"

/**
 * Single curated publisher of org.hypercerts.claim.rights records. The
 * Rights field lists every record under this DID's collection and uses the
 * record's `rightsName` as the label. If more publishers come online, swap
 * this for a discovery step (search index, indexer query, etc.).
 */
const RIGHTS_PUBLISHER_DID = "did:plc:s4puetfspot742ai7y4otuel"
const RIGHTS_COLLECTION = "org.hypercerts.claim.rights"

export interface RightsOption {
  ref: StrongRef
  name: string
}

export interface RightsOptionsState {
  options: RightsOption[]
  isLoading: boolean
  error: string | null
  /** Load the options again after a failure. */
  retry: () => void
}

/**
 * The rights options for the activity create and edit forms: one
 * `listRecords` on the curated publisher, name-sorted. No pagination: the
 * publisher keeps a small set (well under the 100-record page). Records
 * without a `rightsName` fall back to their rkey so they stay selectable.
 *
 * `onLoaded` runs once per successful load, with the sorted options (the
 * create form uses it to pre-select its default).
 */
export function useRightsOptions(
  onLoaded?: (options: RightsOption[]) => void,
): RightsOptionsState {
  const [options, setOptions] = useState<RightsOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Read the latest callback without re-running the fetch when the
  // caller passes a fresh closure each render.
  const onLoadedRef = useRef(onLoaded)
  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      repo: RIGHTS_PUBLISHER_DID,
      collection: RIGHTS_COLLECTION,
      limit: "100",
    })
    authFetch(`/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load the rights options.")
        const body = (await res.json()) as {
          records?: Array<{
            uri: string
            cid: string
            value?: { rightsName?: unknown }
          }>
        }
        const opts: RightsOption[] = (body.records ?? []).map((rec) => {
          const rawName =
            typeof rec.value?.rightsName === "string"
              ? rec.value.rightsName.trim()
              : ""
          return {
            ref: { uri: rec.uri, cid: rec.cid },
            name: rawName || rkeyFromUri(rec.uri) || "(unnamed rights)",
          }
        })
        opts.sort((a, b) => a.name.localeCompare(b.name))
        setOptions(opts)
        setError(null)
        onLoadedRef.current?.(opts)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setError(
          err instanceof Error ? err.message : "Couldn't load the rights options.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setIsLoading(true)
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { options, isLoading, error, retry }
}
