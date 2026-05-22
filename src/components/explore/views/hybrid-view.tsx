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

/** Option 6 — recommendation: feed + faceted sidebar.
 *
 *  Default surface is the unified activity feed (option 1). A
 *  compact left rail lets the user focus on a single lexicon
 *  (option 2). Best-of-both: feed for discovery, facets for
 *  focus, with one consistent card vocabulary. */
export default function HybridView({ items }: Props) {
  const groups = useMemo(() => {
    const map = new Map<ContextLexicon, CertContextItem[]>()
    for (const i of items) {
      const list = map.get(i.lexicon) ?? []
      list.push(i)
      map.set(i.lexicon, list)
    }
    return map
  }, [items])

  const [focus, setFocus] = useState<ContextLexicon | null>(null)

  const visible = focus
    ? items.filter((i) => i.lexicon === focus)
    : items

  return (
    <div className="ctx-hybrid">
      <aside className="ctx-hybrid__rail" aria-label="Focus by lexicon">
        <button
          type="button"
          className={`ctx-hybrid__rail-btn${focus === null ? " ctx-hybrid__rail-btn--active" : ""}`}
          onClick={() => setFocus(null)}
        >
          <span className="ctx-hybrid__rail-label">All</span>
          <span className="ctx-hybrid__rail-count">{items.length}</span>
        </button>
        {Array.from(groups.entries()).map(([lex, list]) => (
          <button
            key={lex}
            type="button"
            className={`ctx-hybrid__rail-btn${focus === lex ? " ctx-hybrid__rail-btn--active" : ""}`}
            onClick={() => setFocus((v) => (v === lex ? null : lex))}
          >
            <span className="ctx-hybrid__rail-label">
              {CONTEXT_LEXICON_META[lex].plural}
            </span>
            <span className="ctx-hybrid__rail-count">{list.length}</span>
          </button>
        ))}
      </aside>
      <div className="ctx-hybrid__feed">
        {visible.length === 0 ? (
          <p className="ctx-empty">No records to show.</p>
        ) : (
          <ul className="ctx-feed__list">
            {visible.map((item) => (
              <li key={item.uri}>
                <ContextItemCard
                  item={item}
                  showLexiconChip={focus === null}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
