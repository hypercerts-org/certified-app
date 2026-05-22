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

type Selection =
  | { kind: "all" }
  | { kind: "lexicon"; lexicon: ContextLexicon }
  | { kind: "subtype"; lexicon: ContextLexicon; subtype: string }

/** Option 2 — Notion / VS-Code Explorer faceted left rail.
 *
 *  Top-level nodes per lexicon, expanding to show distinct subtypes
 *  that are actually present. Click a node to filter the main pane.
 *  The lexicon list is dynamic; subtype list is dynamic per
 *  lexicon. */
export default function FacetedSidebarView({ items }: Props) {
  const grouped = useMemo(() => {
    const byLex = new Map<ContextLexicon, Map<string, CertContextItem[]>>()
    for (const i of items) {
      const sub = i.subtype ?? "—"
      let lexMap = byLex.get(i.lexicon)
      if (!lexMap) {
        lexMap = new Map()
        byLex.set(i.lexicon, lexMap)
      }
      const bucket = lexMap.get(sub) ?? []
      bucket.push(i)
      lexMap.set(sub, bucket)
    }
    return byLex
  }, [items])

  const [sel, setSel] = useState<Selection>({ kind: "all" })

  const visible = useMemo(() => {
    if (sel.kind === "all") return items
    if (sel.kind === "lexicon")
      return items.filter((i) => i.lexicon === sel.lexicon)
    return items.filter(
      (i) =>
        i.lexicon === sel.lexicon &&
        (i.subtype ?? "—") === sel.subtype,
    )
  }, [items, sel])

  return (
    <div className="ctx-faceted">
      <nav className="ctx-faceted__nav" aria-label="Filter by lexicon">
        <button
          type="button"
          className={`ctx-faceted__node ctx-faceted__node--root${sel.kind === "all" ? " ctx-faceted__node--active" : ""}`}
          onClick={() => setSel({ kind: "all" })}
        >
          All ({items.length})
        </button>
        {Array.from(grouped.entries()).map(([lex, subMap]) => {
          const total = Array.from(subMap.values()).reduce(
            (s, arr) => s + arr.length,
            0,
          )
          const isLexActive =
            (sel.kind === "lexicon" && sel.lexicon === lex) ||
            (sel.kind === "subtype" && sel.lexicon === lex)
          return (
            <div key={lex} className="ctx-faceted__group">
              <button
                type="button"
                className={`ctx-faceted__node${isLexActive ? " ctx-faceted__node--active" : ""}`}
                onClick={() => setSel({ kind: "lexicon", lexicon: lex })}
              >
                {CONTEXT_LEXICON_META[lex].plural} ({total})
              </button>
              <ul className="ctx-faceted__sublist">
                {Array.from(subMap.entries()).map(([sub, list]) => {
                  const subActive =
                    sel.kind === "subtype" &&
                    sel.lexicon === lex &&
                    sel.subtype === sub
                  return (
                    <li key={sub}>
                      <button
                        type="button"
                        className={`ctx-faceted__leaf${subActive ? " ctx-faceted__leaf--active" : ""}`}
                        onClick={() =>
                          setSel({ kind: "subtype", lexicon: lex, subtype: sub })
                        }
                      >
                        {sub} ({list.length})
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
      <div className="ctx-faceted__main">
        {visible.length === 0 ? (
          <p className="ctx-empty">No items.</p>
        ) : (
          <ul className="ctx-feed__list">
            {visible.map((item) => (
              <li key={item.uri}>
                <ContextItemCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
