"use client"

import { useCallback, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import {
  buildPostingOptions,
  type PostingIdentity,
} from "@/lib/groups/posting-identity"

/**
 * Per-action "posting as" state for a single write surface.
 *
 * Returns the ordered option list (You first, then every writable
 * group) and the currently-chosen identity. The DEFAULT is always You —
 * it is deliberately NOT seeded from `useOrg().activeOrg` or any
 * last-used value, because the org-identity write model is per-action:
 * each action starts from the safe personal default and the user
 * opts into a group explicitly. `reset()` returns to You, which a
 * caller should invoke after a successful write so the next action
 * doesn't silently inherit the previous group choice.
 *
 * The "You" option is decorated with the viewer's resolved handle +
 * avatar (via `useAuthorInfo`) when available; group rows carry the
 * group's own handle/avatar/role from `useOrg().groups`.
 *
 * @param initial optional starting identity (e.g. to restore a draft).
 *   Ignored if it isn't one of the currently-available options — the
 *   value always resolves to a real option, falling back to You.
 */
export function usePostingIdentity({
  initial,
}: { initial?: PostingIdentity } = {}): {
  options: PostingIdentity[]
  value: PostingIdentity
  setValue: (next: PostingIdentity) => void
  reset: () => void
} {
  const { did } = useAuth()
  const { groups } = useOrg()
  const { info: selfInfo } = useAuthorInfo(did)

  const options = useMemo(
    () =>
      buildPostingOptions(
        {
          did: did ?? "",
          handle: selfInfo?.handle,
          avatarUrl: selfInfo?.avatarUrl ?? undefined,
        },
        groups,
      ),
    [did, selfInfo?.handle, selfInfo?.avatarUrl, groups],
  )

  // The personal option is always first (buildPostingOptions guarantees
  // it). It is the default, the reset target, and the fallback whenever a
  // stored / `initial` value no longer matches an available option.
  const youOption = options[0]

  // Track the chosen DID rather than the object so identity survives the
  // handle/avatar resolving in (which rebuilds the option objects). When
  // an `initial` is supplied AND it is still an available option, start
  // there; otherwise start at You.
  const [selectedDid, setSelectedDid] = useState<string | null>(() =>
    initial && initial.did !== youOption?.did ? initial.did : null,
  )

  const value = useMemo<PostingIdentity>(() => {
    if (selectedDid) {
      const match = options.find((o) => o.did === selectedDid)
      if (match) return match
    }
    // Default / fallback: You. youOption is always defined once options
    // is built; the empty-did guard keeps the type total for the brief
    // pre-auth window.
    return youOption ?? { did: "", kind: "personal", label: "You" }
  }, [selectedDid, options, youOption])

  const setValue = useCallback((next: PostingIdentity) => {
    setSelectedDid(next.kind === "personal" ? null : next.did)
  }, [])

  const reset = useCallback(() => {
    setSelectedDid(null)
  }, [])

  return { options, value, setValue, reset }
}
