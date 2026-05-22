"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import ContextItemCard from "@/components/explore/context-item-card"
import {
  CONTEXT_LEXICON_META,
  type CertContextItem,
  type ContextLexicon,
} from "@/lib/atproto/cert-context"

interface Props {
  items: CertContextItem[]
}

/** Option 3 — Notion-page accordion / stacked sections.
 *
 *  One collapsible section per non-empty lexicon. Headers show
 *  count + most-recent timestamp. Everything is visible at a glance
 *  without a nav step. */
export default function AccordionView({ items }: Props) {
  const sections = useMemo(() => {
    const map = new Map<ContextLexicon, CertContextItem[]>()
    for (const i of items) {
      const list = map.get(i.lexicon) ?? []
      list.push(i)
      map.set(i.lexicon, list)
    }
    return Array.from(map.entries())
  }, [items])

  const [collapsed, setCollapsed] = useState<Set<ContextLexicon>>(new Set())

  function toggle(l: ContextLexicon) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      return next
    })
  }

  if (sections.length === 0) {
    return <p className="ctx-empty">No related records yet.</p>
  }

  return (
    <div className="ctx-accordion">
      {sections.map(([lex, list]) => {
        const isCollapsed = collapsed.has(lex)
        const latest = list[0]?.createdAt
        return (
          <section key={lex} className="ctx-accordion__section">
            <button
              type="button"
              className="ctx-accordion__header"
              onClick={() => toggle(lex)}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
              )}
              <span className="ctx-accordion__title">
                {CONTEXT_LEXICON_META[lex].plural}
              </span>
              <span className="ctx-accordion__count">{list.length}</span>
              {latest ? (
                <span className="ctx-accordion__when">
                  latest {new Date(latest).toLocaleDateString()}
                </span>
              ) : null}
            </button>
            {!isCollapsed ? (
              <ul className="ctx-feed__list">
                {list.map((item) => (
                  <li key={item.uri}>
                    <ContextItemCard item={item} showLexiconChip={false} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
