"use client"

/**
 * Whether an account is a person or an organization, for the shape of its
 * avatar everywhere it is drawn (record bylines, "Who's behind it", the
 * profile's endorsers and endorsed accounts): organizations square, people
 * round, a neutral block while the kind isn't known.
 */

import { useEffect, useRef, useState } from "react"
import { useOrgMarker } from "@/hooks/use-org-marker"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"

/** Automatic retries of a failed organization-marker read, before the
 *  account's kind is left unknown. */
const KIND_RETRY_DELAYS_MS = [1_500, 4_000, 10_000] as const

/**
 * Whether an account is a person or an organization, for its avatar's
 * shape: `unknown` while its marker loads, and when the read failed (a
 * 429), so a failed lookup never draws an organization as a person. A
 * failed read is retried a few times with backoff (`autoRetry: false`
 * for a grid of many accounts, so a rate limit isn't met with more
 * requests).
 */
export function useAccountKind(
  did: string,
  { autoRetry = true }: { autoRetry?: boolean } = {},
) {
  const marker = useOrgMarker(did)
  const known = marker.answeredFor === did && !marker.failed
  const kind: "person" | "org" | "unknown" = !known
    ? "unknown"
    : marker.isOrg
      ? "org"
      : "person"

  // The marker hook's refresh is a new function each render.
  const refreshRef = useRef(marker.refresh)
  useEffect(() => {
    refreshRef.current = marker.refresh
  })
  const [tries, setTries] = useState({ did, n: 0 })
  const n = !autoRetry ? KIND_RETRY_DELAYS_MS.length : tries.did === did ? tries.n : 0
  const failedNow = marker.failed && !marker.isLoading
  useEffect(() => {
    if (!failedNow) return
    const delay = KIND_RETRY_DELAYS_MS[n]
    if (delay === undefined) return
    const timer = setTimeout(() => {
      setTries({ did, n: n + 1 })
      refreshRef.current()
    }, delay)
    return () => clearTimeout(timer)
  }, [failedNow, n, did])

  // Out of retries: the kind stays unknown until `retry()`.
  const failed = failedNow && n >= KIND_RETRY_DELAYS_MS.length
  return {
    kind,
    marker: marker.marker,
    /** Still reading the marker, or about to retry it. */
    pending: !known && !failed,
    failed,
    retry: () => {
      setTries({ did, n: KIND_RETRY_DELAYS_MS.length })
      refreshRef.current()
    },
  }
}

/** The avatar's place while the account's kind isn't known: the
 *  placeholder block the profile header holds for it (never a person's
 *  circle), pulsing while the read goes on, still once it has failed. */
export function KindPendingAvatar({ size, animate }: { size: number; animate: boolean }) {
  return (
    <Skeleton
      variant="box"
      width={size}
      height={size}
      animate={animate}
      className="flex-none"
      aria-hidden
    />
  )
}

const AVATAR_PX = { xs: 20, sm: 32, row: 40 } as const

/**
 * An account's avatar in the shape of its kind: square for an
 * organization, round for a person, the neutral block while the kind
 * isn't known (or its read failed). `autoRetry: false` where many
 * accounts are drawn at once.
 */
export function KindAvatar({
  did,
  size,
  src,
  initials,
  alt = "",
  autoRetry = true,
}: {
  did: string
  size: keyof typeof AVATAR_PX
  src?: string | null
  initials: string
  alt?: string
  autoRetry?: boolean
}) {
  const account = useAccountKind(did, { autoRetry })
  if (account.kind === "unknown") {
    return <KindPendingAvatar size={AVATAR_PX[size]} animate={account.pending} />
  }
  return (
    <Avatar
      size={size}
      shape={account.kind === "org" ? "square" : "circle"}
      src={src || undefined}
      alt={alt}
      fallbackInitials={initials}
      seed={did}
    />
  )
}
