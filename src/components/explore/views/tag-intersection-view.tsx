"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import ContextItemCard from "@/components/explore/context-item-card"
import {
  CONTEXT_LEXICON_META,
  type CertContextItem,
  type ContextLexicon,
} from "@/lib/atproto/cert-context"

interface Props {
  items: CertContextItem[]
}

interface TagKey {
  kind: "lexicon" | "subtype" | "year"
  value: string
  label: string
}

/** Option 4 — Apple Files / Things 3 tag intersection.
 *
 *  Every item carries multiple tags (lexicon, subtype, year). The
 *  user picks tags and the result is the intersection — items that
 *  carry every selected tag. Very type-agnostic, very query-like. */
export default function TagIntersectionView({ items }: Props) {
  const allTags = useMemo<TagKey[]>(() => {
    const seen = new Map<string, TagKey>()
    for (const i of items) {
      const lexKey = `lex:${i.lexicon}`
      if (!seen.has(lexKey)) {
        seen.set(lexKey, {
          kind: "lexicon",
          value: i.lexicon,
          label: CONTEXT_LEXICON_META[i.lexicon].plural,
        })
      }
      if (i.subtype) {
        const subKey = `sub:${i.lexicon}:${i.subtype}`
        if (!seen.has(subKey)) {
          seen.set(subKey, {
            kind: "subtype",
            value: `${i.lexicon}:${i.subtype}`,
            label: i.subtype,
          })
        }
      }
      if (i.createdAt) {
        const year = new Date(i.createdAt).getFullYear().toString()
        const yKey = `year:${year}`
        if (!seen.has(yKey)) {
          seen.set(yKey, { kind: "year", value: year, label: year })
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => {
      // group by kind: lexicon, subtype, year — stable within group.
      const order = { lexicon: 0, subtype: 1, year: 2 } as const
      return order[a.kind] - order[b.kind]
    })
  }, [items])

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = items.filter((i) => {
    if (selected.size === 0) return true
    for (const sel of selected) {
      const [kind, ...rest] = sel.split(":")
      const value = rest.join(":")
      if (kind === "lex" && i.lexicon !== value) return false
      if (kind === "sub") {
        const [lex, sub] = value.split(":", 2)
        if (i.lexicon !== lex || i.subtype !== sub) return false
      }
      if (kind === "year") {
        const y = i.createdAt
          ? new Date(i.createdAt).getFullYear().toString()
          : ""
        if (y !== value) return false
      }
    }
    return true
  })

  function tagKey(t: TagKey): string {
    if (t.kind === "lexicon") return `lex:${t.value}`
    if (t.kind === "subtype") return `sub:${t.value}`
    return `year:${t.value}`
  }

  return (
    <div className="ctx-tags">
      <div className="ctx-tags__bar" role="group" aria-label="Filter tags">
        <span className="ctx-tags__hint">
          {selected.size === 0
            ? "Pick tags to intersect"
            : `${visible.length} match${visible.length === 1 ? "" : "es"}`}
        </span>
        {Array.from(selected).map((k) => {
          const tag = allTags.find((t) => tagKey(t) === k)
          if (!tag) return null
          return (
            <button
              key={k}
              type="button"
              className="ctx-chip ctx-chip--active ctx-tags__active"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  next.delete(k)
                  return next
                })
              }
            >
              {tag.label}
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          )
        })}
        {selected.size > 0 ? (
          <button
            type="button"
            className="ctx-tags__clear"
            onClick={() => setSelected(new Set())}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="ctx-tags__available">
        {allTags
          .filter((t) => !selected.has(tagKey(t)))
          .map((t) => (
            <button
              key={tagKey(t)}
              type="button"
              className={`ctx-chip ctx-chip--${t.kind}`}
              onClick={() =>
                setSelected((prev) => new Set(prev).add(tagKey(t)))
              }
            >
              {t.label}
            </button>
          ))}
      </div>

      {visible.length === 0 ? (
        <p className="ctx-empty">No items match the intersection.</p>
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
  )
}
