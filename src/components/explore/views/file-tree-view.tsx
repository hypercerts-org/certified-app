"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, FileText } from "lucide-react"
import {
  CONTEXT_LEXICON_META,
  type CertContextItem,
  type ContextLexicon,
} from "@/lib/atproto/cert-context"
import ContextItemCard from "@/components/explore/context-item-card"

interface Props {
  items: CertContextItem[]
}

/** Option 5 — GitHub repo tree.
 *
 *  Filesystem metaphor: subject/<lexicon>/<subtype>/<record>. Each
 *  tier is independently expandable; clicking a leaf opens the
 *  detail card inline below the tree. */
export default function FileTreeView({ items }: Props) {
  const tree = useMemo(() => {
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

  // Expand everything by default — a fresh tree should reveal what's
  // there. Users can collapse what they don't care about.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const lex of tree.keys()) {
      s.add(lex)
      for (const sub of tree.get(lex)!.keys()) {
        s.add(`${lex}/${sub}`)
      }
    }
    return s
  })

  const [openLeaf, setOpenLeaf] = useState<string | null>(null)

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openItem = openLeaf ? items.find((i) => i.uri === openLeaf) : null

  return (
    <div className="ctx-tree">
      <div className="ctx-tree__pane">
        {Array.from(tree.entries()).map(([lex, subMap]) => {
          const lexOpen = expanded.has(lex)
          return (
            <div key={lex} className="ctx-tree__node">
              <button
                type="button"
                className="ctx-tree__row"
                onClick={() => toggle(lex)}
                aria-expanded={lexOpen}
              >
                {lexOpen ? (
                  <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
                ) : (
                  <ChevronRight size={13} strokeWidth={1.75} aria-hidden />
                )}
                <span className="ctx-tree__label">
                  {CONTEXT_LEXICON_META[lex].plural}/
                </span>
              </button>
              {lexOpen ? (
                <div className="ctx-tree__children">
                  {Array.from(subMap.entries()).map(([sub, list]) => {
                    const subKey = `${lex}/${sub}`
                    const subOpen = expanded.has(subKey)
                    return (
                      <div key={subKey} className="ctx-tree__node">
                        <button
                          type="button"
                          className="ctx-tree__row"
                          onClick={() => toggle(subKey)}
                          aria-expanded={subOpen}
                        >
                          {subOpen ? (
                            <ChevronDown
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          ) : (
                            <ChevronRight
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          )}
                          <span className="ctx-tree__label">{sub}/</span>
                          <span className="ctx-tree__count">{list.length}</span>
                        </button>
                        {subOpen ? (
                          <ul className="ctx-tree__children ctx-tree__leaves">
                            {list.map((item) => (
                              <li key={item.uri}>
                                <button
                                  type="button"
                                  className={`ctx-tree__leaf${openLeaf === item.uri ? " ctx-tree__leaf--active" : ""}`}
                                  onClick={() =>
                                    setOpenLeaf((v) =>
                                      v === item.uri ? null : item.uri,
                                    )
                                  }
                                >
                                  <FileText
                                    size={12}
                                    strokeWidth={1.75}
                                    aria-hidden
                                  />
                                  <span className="ctx-tree__leaf-title">
                                    {item.title}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="ctx-tree__detail">
        {openItem ? (
          <ContextItemCard item={openItem} showLexiconChip />
        ) : (
          <p className="ctx-empty">
            Select a record on the left to see its detail.
          </p>
        )}
      </div>
    </div>
  )
}
