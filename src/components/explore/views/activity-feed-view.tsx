"use client"

import { useMemo, useState } from "react"
import ContextItemCard from "@/components/explore/context-item-card"
import {
  CONTEXT_LEXICON_META,
  type CertContextItem,
  type ContextLexicon,
} from "@/lib/atproto/cert-context"

interface Props {
  items: CertContextItem[]
}

/** Option 1 — Bluesky/Linear-Inbox feed.
 *
 *  One reverse-chronological stream of every related record.
 *  Chip row at the top toggles which lexicons appear. Chip set is
 *  populated dynamically from the data, so unknown lexicons would
 *  surface here automatically if we ever add them. */
export default function ActivityFeedView({ items }: Props) {
  const lexicons = useMemo(() => {
    const present = new Set<ContextLexicon>()
    for (const i of items) present.add(i.lexicon)
    return Array.from(present)
  }, [items])

  const [active, setActive] = useState<Set<ContextLexicon>>(new Set())

  const filtered =
    active.size === 0
      ? items
      : items.filter((i) => active.has(i.lexicon))

  function toggle(l: ContextLexicon) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      return next
    })
  }

  return (
    <div className="ctx-feed">
      {lexicons.length > 1 ? (
        <div className="ctx-feed__chips" role="group" aria-label="Filter by type">
          <button
            type="button"
            className={`ctx-chip${active.size === 0 ? " ctx-chip--active" : ""}`}
            onClick={() => setActive(new Set())}
          >
            All ({items.length})
          </button>
          {lexicons.map((l) => {
            const count = items.filter((i) => i.lexicon === l).length
            const on = active.has(l)
            return (
              <button
                key={l}
                type="button"
                className={`ctx-chip${on ? " ctx-chip--active" : ""}`}
                onClick={() => toggle(l)}
              >
                {CONTEXT_LEXICON_META[l].plural} ({count})
              </button>
            )
          })}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="ctx-empty">Nothing here matches the active filters.</p>
      ) : (
        <ul className="ctx-feed__list">
          {filtered.map((item) => (
            <li key={item.uri}>
              <ContextItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
