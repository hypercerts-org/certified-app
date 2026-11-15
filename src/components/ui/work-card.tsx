"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import FitImage from "@/components/ui/fit-image"

export type WorkCardLayout = "grid" | "wide"

/** The layout rule for a list of work cards: one is a wide card, two or
 *  more a 2-up grid (DESIGN.md §9.14). */
export function workCardLayout(count: number): WorkCardLayout {
  return count === 1 ? "wide" : "grid"
}

/**
 * One piece of work (an activity or a project) as a card, the same on the
 * profile and the record pages (DESIGN.md §9.14): the 16:9 photo, the
 * serif title (two lines), a meta line (period and place, or how many
 * activities) and a short summary. The whole card is one link.
 *
 * `layout="wide"` (a list of one) lays the photo beside the text from
 * 800px; `grid` stacks them. Without a photo a grid card keeps an empty
 * frame with `placeholder` from 800px (so a row of cards lines up) and
 * none on phones; a wide card drops the frame.
 *
 * Use it through `<WorkCardList>`, which applies the layout rule.
 */
export default function WorkCard({
  href,
  image,
  title,
  titleAs: Title = "h3",
  meta,
  summary,
  layout = "grid",
  placeholder,
  children,
}: {
  href: string | null
  image: string | null
  title: string
  titleAs?: "h2" | "h3"
  /** "31 May – 31 Dec 2026 · Kawhia Harbour", "3 activities". */
  meta?: ReactNode
  summary?: string | null
  layout?: WorkCardLayout
  /** The icon in an empty photo frame. */
  placeholder?: ReactNode
  /** More facts under the summary (work scope tags). Nothing interactive:
   *  the card is a link. */
  children?: ReactNode
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!image && failed !== image

  const body = (
    <>
      {showImage ? (
        <div className="work-card__image">
          <FitImage src={image!} onError={() => setFailed(image)} />
        </div>
      ) : layout === "grid" ? (
        <div className="work-card__image work-card__image--empty" aria-hidden="true">
          {placeholder}
        </div>
      ) : null}
      <div className="work-card__body">
        <Title className="work-card__title" dir="auto">
          {title}
        </Title>
        {meta ? <p className="work-card__meta">{meta}</p> : null}
        {summary ? (
          <p className="work-card__summary" dir="auto">
            {summary}
          </p>
        ) : null}
        {children}
      </div>
    </>
  )

  const className = `work-card work-card--${layout}${showImage ? "" : " work-card--no-image"}`
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/**
 * Work cards with the layout rule applied: one item is a wide card, two or
 * more a 2-up grid. `render` draws one item with the layout it gets.
 */
export function WorkCardList<T>({
  items,
  itemKey,
  render,
  label,
}: {
  items: readonly T[]
  itemKey: (item: T) => string
  render: (item: T, layout: WorkCardLayout) => ReactNode
  /** The list's accessible name, when its heading doesn't give one. */
  label?: string
}) {
  const layout = workCardLayout(items.length)
  return (
    <ul className={`work-card-list work-card-list--${layout}`} aria-label={label}>
      {items.map((item) => (
        <li key={itemKey(item)}>{render(item, layout)}</li>
      ))}
    </ul>
  )
}
