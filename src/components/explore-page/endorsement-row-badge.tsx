"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"

/**
 * Compute a "corroboration count" for every DID that appears as a
 * predecessor anywhere in the closure result — how many times that DID
 * shows up across all `via` arrays. Used to rank the via list in the
 * popover.
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
 * Compact identity used to render via entries. Built by the page from
 * whatever it has already loaded; unresolved DIDs fall back to a
 * shortened DID label. No per-row PDS fetches.
 */
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
 * Inline degree label rendered immediately before the row's handle
 * with a middle-dot separator. For degrees 2 / 3 the label is a button
 * that toggles a popover listing the via predecessors (highest
 * corroboration count first). Degree 1 has no via (the viewer is the
 * predecessor) so it renders as a non-interactive pill.
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
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const hasVia = meta.degree > 1 && meta.via.length > 0

  // Sort via DIDs by corroboration DESC, lexicographic ASC for ties.
  // Done once on open so we don't pay it on every render.
  const orderedVia = useMemo(() => {
    if (!hasVia) return []
    return [...meta.via].sort((a, b) => {
      const ca = corroboration.get(a) ?? 0
      const cb = corroboration.get(b) ?? 0
      if (cb !== ca) return cb - ca
      return a < b ? -1 : a > b ? 1 : 0
    })
  }, [meta.via, corroboration, hasVia])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const pillClass = `endorsement-row-badge__degree endorsement-row-badge__degree--d${meta.degree}`
  const title = hasVia
    ? `Reachable at degree ${meta.degree}. Click to see who connects you.`
    : `Reachable at degree ${meta.degree} through your endorsement graph.`

  return (
    <span className="endorsement-row-badge" ref={containerRef}>
      {hasVia ? (
        <button
          type="button"
          className={pillClass}
          // Stop click from bubbling to the parent <Link> in
          // ActivityAuthor (which would otherwise navigate to the
          // author profile when the user just wants to expand the
          // popover).
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          aria-haspopup="true"
          title={title}
        >
          {DEGREE_LABEL[meta.degree]}
        </button>
      ) : (
        <span className={pillClass} title={title}>
          {DEGREE_LABEL[meta.degree]}
        </span>
      )}
      <span className="endorsement-row-badge__sep" aria-hidden>
        ·
      </span>
      {open && hasVia ? (
        <ul
          className="endorsement-row-badge__via-list"
          role="menu"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <li className="endorsement-row-badge__via-list-header">
            Connected via {orderedVia.length}
            {orderedVia.length === 1 ? " person" : " people"}
          </li>
          {orderedVia.slice(0, 10).map((d) => (
            <li key={d}>{identityLabel(identityMap.get(d), d)}</li>
          ))}
          {orderedVia.length > 10 ? (
            <li className="endorsement-row-badge__via-list-more">
              and {orderedVia.length - 10} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </span>
  )
}

function identityLabel(identity: ViaIdentity | undefined, did: string): string {
  if (identity?.handle) return `@${identity.handle}`
  if (identity?.displayName) return identity.displayName
  return did.startsWith("did:plc:")
    ? `${did.slice(8, 14)}…${did.slice(-4)}`
    : did
}
