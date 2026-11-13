"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import { ACTIVITY_COLLECTION } from "@/lib/atproto/delete-own-record"

/** Own activities load from the PDS in pages of this many… */
export const ACTIVITY_PAGE = 100
/** …up to this many pages, so "Without a project" can be worked out. */
export const ACTIVITY_MAX_PAGES = 10

export interface OwnActivitiesState {
  records: ActivityRecord[]
  isLoading: boolean
  error: boolean
  /** More than ACTIVITY_PAGE × ACTIVITY_MAX_PAGES exist; only the newest load. */
  truncated: boolean
}

/**
 * All of the signed-in person's own activities, read from their PDS with
 * `listRecords` (newest first) through the XRPC proxy.
 *
 * The PDS rather than the indexer: the page needs whole records (the
 * indexer's activity selection has no `contributors`, which the rows show
 * as avatars), and the PDS shows a new, edited or deleted activity at once
 * where the indexer can lag. Sorted newest first by `createdAt`.
 */
export function useOwnActivities(did: string): OwnActivitiesState {
  const [state, setState] = useState<OwnActivitiesState>({
    records: [],
    isLoading: true,
    error: false,
    truncated: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      const all: ActivityRecord[] = []
      let cursor: string | undefined
      for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
        const params = new URLSearchParams({
          repo: did,
          collection: ACTIVITY_COLLECTION,
          limit: String(ACTIVITY_PAGE),
        })
        if (cursor) params.set("cursor", cursor)
        // no-store: the proxy lets the browser keep a same-session list
        // for a few seconds, which would hide an activity created or
        // deleted just before this page opened.
        const res = await authFetch(
          `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
          { signal: controller.signal, cache: "no-store" },
        )
        // A repo that has never written an activity answers 400/404.
        if (res.status === 400 || res.status === 404) break
        if (!res.ok) throw new Error(`listRecords failed: ${res.status}`)
        const data = (await res.json()) as { records?: ActivityRecord[]; cursor?: string }
        const records = data.records ?? []
        all.push(...records)
        if (!data.cursor || records.length === 0) return { records: all, truncated: false }
        cursor = data.cursor
      }
      return { records: all, truncated: !!cursor && all.length >= ACTIVITY_PAGE * ACTIVITY_MAX_PAGES }
    }
    run()
      .then(({ records, truncated }) => {
        if (controller.signal.aborted) return
        const sorted = records
          .filter((r) => r && typeof r.uri === "string" && r.value && typeof r.value === "object")
          .sort((a, b) => (b.value.createdAt ?? "").localeCompare(a.value.createdAt ?? ""))
        setState({ records: sorted, isLoading: false, error: false, truncated })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, isLoading: false, error: true }))
      })
    return () => controller.abort()
  }, [did])

  return state
}
