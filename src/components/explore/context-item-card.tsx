"use client"

import { Folder, Paperclip, Ruler, Star, type LucideIcon } from "lucide-react"
import { formatShortDate } from "@/lib/utils/format-date"
import type {
  CertContextItem,
  ContextLexicon,
} from "@/lib/atproto/cert-context"

const ICONS: Record<ContextLexicon, LucideIcon> = {
  attachment: Paperclip,
  evaluation: Star,
  measurement: Ruler,
  collection: Folder,
}

interface ContextItemCardProps {
  item: CertContextItem
  /** When true, show the lexicon label as a chip on the card head.
   *  Views that already group by lexicon (accordion, file-tree)
   *  can opt out. */
  showLexiconChip?: boolean
  /** Compact density — for sidebar lists and tree rows. */
  dense?: boolean
}

/** Shared visual unit for every related record. All six explore
 *  views render the same items[] via this card; per-lexicon detail
 *  rendering happens here so views don't fork. */
export default function ContextItemCard({
  item,
  showLexiconChip = true,
  dense = false,
}: ContextItemCardProps) {
  const Icon = ICONS[item.lexicon]
  const date = item.createdAt ? formatShortDate(item.createdAt) : null
  return (
    <article
      className={
        dense
          ? "ctx-item ctx-item--dense"
          : "ctx-item"
      }
      data-lexicon={item.lexicon}
    >
      <header className="ctx-item__head">
        <Icon
          size={dense ? 13 : 15}
          strokeWidth={1.75}
          aria-hidden
          className="ctx-item__icon"
        />
        {showLexiconChip ? (
          <span className="ctx-item__lex">
            {capitalizeLexicon(item.lexicon)}
          </span>
        ) : null}
        {item.subtype ? (
          <span className="ctx-item__subtype">{item.subtype}</span>
        ) : null}
        {date ? <time className="ctx-item__date">{date}</time> : null}
      </header>
      <div className="ctx-item__title">{item.title}</div>
      {item.summary && !dense ? (
        <p className="ctx-item__summary">{item.summary}</p>
      ) : null}
    </article>
  )
}

function capitalizeLexicon(l: ContextLexicon): string {
  return l.charAt(0).toUpperCase() + l.slice(1)
}
