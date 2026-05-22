"use client"

import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"

/**
 * Compute a "corroboration count" for every DID that appears as a
 * predecessor anywhere in the closure result. Retained for callers
 * that still pass it through, but currently unused by the badge
 * itself — the via list is not surfaced in the UI today.
 */
export function buildCorroborationCounts(
  closureByDid: Map<string, EndorsementClosureAccount>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const account of closureByDid.values()) {
    for (const predecessor of account.via) {
      counts.set(predecessor, (counts.get(predecessor) ?? 0) + 1)
    }
  }
  return counts
}

export interface ViaIdentity {
  did: string
  handle?: string | null
  displayName?: string | null
}

export type ViaIdentityMap = Map<string, ViaIdentity>

const DEGREE_LABEL: Record<1 | 2 | 3, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
}

/**
 * Static degree pill — "1st" / "2nd" / "3rd" coloured by tier. No
 * interactivity; the via predecessor list is intentionally hidden.
 * `corroboration` and `identityMap` props are accepted for API
 * compatibility with existing call sites but are unused.
 */
export default function EndorsementRowBadge({
  meta,
}: {
  meta: EndorsementClosureAccount
  corroboration?: Map<string, number>
  identityMap?: ViaIdentityMap
}) {
  return (
    <span
      className={`endorsement-row-badge__degree endorsement-row-badge__degree--d${meta.degree}`}
      title={`Reachable at degree ${meta.degree} through your endorsement graph.`}
    >
      {DEGREE_LABEL[meta.degree]}
    </span>
  )
}
