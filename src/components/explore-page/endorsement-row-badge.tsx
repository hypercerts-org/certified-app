"use client"

import { useMemo, useState } from "react"
import { CornerDownLeft } from "lucide-react"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"

/**
 * Compute a "corroboration count" for every DID that appears as a
 * predecessor anywhere in the closure result — how many times that DID
 * shows up across all `via` arrays. The count is the in-graph
 * endorsement frequency we use to pick a representative for the "via"
 * line per row.
 *
 * Returns the map by reference so the explore page can compute it once
 * per closure refresh and pass it into every row — O(N) work shared,
 * not O(N²) per-row.
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

/**
 * Compact identity used by `EndorsementRowBadge` to render the "via"
 * line. Built from whatever the page already has loaded — typically
 * the `NetworkActor[]` for the Accounts kind, or denormalised author
 * blocks on Projects / Certs. We deliberately don't issue per-row PDS
 * fetches; an unresolved predecessor falls back to a shortened DID.
 */
export interface ViaIdentity {
  did: string
  handle?: string | null
  displayName?: string | null
}

export type ViaIdentityMap = Map<string, ViaIdentity>

/**
 * Pick a representative predecessor DID from `via` per the issue #84
 * spec: "highest in-graph endorsement count, tie-break by lexicographic
 * order of DID for determinism." The original spec called for a
 * recency tie-break, but the closure response doesn't carry per-edge
 * timestamps — the materialised view collapses the issuer→subject
 * relationship without preserving the award's createdAt. Lexicographic
 * tie-break is what the closure server-side sort already gives us, so
 * "first element after corroboration-DESC sort" is deterministic.
 * Recency would need a follow-up exposing per-edge timestamps from
 * the indexer.
 */
function pickRepresentative(
  via: string[],
  corroboration: Map<string, number>,
): string | null {
  if (via.length === 0) return null
  let best = via[0]
  let bestCount = corroboration.get(best) ?? 0
  for (let i = 1; i < via.length; i++) {
    const did = via[i]
    const count = corroboration.get(did) ?? 0
    // Strictly greater wins; tie keeps the earlier-encountered DID,
    // and since `via` arrives already sorted lexicographically from
    // the server (see internal/endorsement/closure.go), ties resolve
    // deterministically without an explicit string compare.
    if (count > bestCount) {
      best = did
      bestCount = count
    }
  }
  return best
}

const DEGREE_BADGE_LABEL: Record<1 | 2 | 3, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
}

/**
 * Compact "degree + via" decoration rendered on an explore-result
 * row when the active filter is endorsement-based. Three flavours
 * depending on the account's degree:
 *
 *   - degree 1 → just the pill. No "via" line (the viewer IS the
 *     predecessor per spec — not attributed).
 *   - degree 2 / 3 → pill + `↩ via @{representative} +N` line.
 *     Click the +N to reveal the full predecessor list (cap-rendered
 *     to 10 with "and N more").
 *
 * Handle resolution reads from `identityMap` — typically built by
 * the explore page from the already-loaded NetworkActors. Unresolved
 * DIDs fall back to a shortened DID. No per-row PDS fetches.
 */
export default function EndorsementRowBadge({
  meta,
  corroboration,
  identityMap,
}: {
  meta: EndorsementClosureAccount
  corroboration: Map<string, number>
  identityMap: ViaIdentityMap
}) {
  const representative = useMemo(
    () => pickRepresentative(meta.via, corroboration),
    [meta.via, corroboration],
  )

  const [open, setOpen] = useState(false)
  const remaining = Math.max(0, meta.via.length - 1)

  return (
    <div className="endorsement-row-badge">
      <span
        className={`endorsement-row-badge__degree endorsement-row-badge__degree--d${meta.degree}`}
        title={`Reachable at degree ${meta.degree} through your endorsement graph`}
      >
        {DEGREE_BADGE_LABEL[meta.degree]}
      </span>
      {meta.degree > 1 && representative ? (
        <div className="endorsement-row-badge__via">
          <CornerDownLeft size={11} strokeWidth={1.75} aria-hidden />
          <span className="endorsement-row-badge__via-rep">
            via {identityLabel(identityMap.get(representative), representative)}
          </span>
          {remaining > 0 ? (
            <button
              type="button"
              className="endorsement-row-badge__via-more"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="endorsement-via-list"
            >
              +{remaining}
            </button>
          ) : null}
          {open && remaining > 0 ? (
            <ul
              id="endorsement-via-list"
              className="endorsement-row-badge__via-list"
            >
              {meta.via
                .filter((d) => d !== representative)
                .slice(0, 10)
                .map((d) => (
                  <li key={d}>{identityLabel(identityMap.get(d), d)}</li>
                ))}
              {meta.via.length > 11 ? (
                <li className="endorsement-row-badge__via-list-more">
                  and {meta.via.length - 11} more
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function identityLabel(identity: ViaIdentity | undefined, did: string): string {
  if (identity?.handle) return `@${identity.handle}`
  if (identity?.displayName) return identity.displayName
  // Fallback: shortened DID. Mirrors AccountListRow's truncation rule.
  return did.startsWith("did:plc:")
    ? `${did.slice(8, 14)}…${did.slice(-4)}`
    : did
}
