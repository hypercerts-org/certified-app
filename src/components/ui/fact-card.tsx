import React from "react"

export interface Fact {
  label: string
  value: React.ReactNode
}

/**
 * A card of facts beside a page's main column (DESIGN.md §9.14): the
 * place, the period, the money, the people behind it. A bordered
 * `--bg-elevated` surface with no shadow, an optional small title, then
 * label/value rows. On a phone it sits in the reading order, full width.
 */
export function FactCard({
  title,
  action,
  children,
  className = "",
  labelledBy,
}: {
  title?: React.ReactNode
  /** Right of the title: a small link such as "All receipts". */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Id of the title, when the card is a landmark section. */
  labelledBy?: string
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 ${className}`.trim()}
      aria-labelledby={labelledBy}
    >
      {title || action ? (
        <div className="flex items-baseline justify-between gap-3">
          {title ? (
            <h2 id={labelledBy} className="m-0 text-ui font-semibold text-[var(--fg-primary)]">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Label/value rows: the label small and muted above its value. */
export function FactList({ facts, className = "" }: { facts: Fact[]; className?: string }) {
  if (facts.length === 0) return null
  return (
    <dl className={`m-0 grid gap-3 ${className}`.trim()}>
      {facts.map((f) => (
        <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-caption text-[var(--fg-muted)]">{f.label}</dt>
          <dd className="m-0 min-w-0 break-words text-body-sm text-[var(--fg-primary)]">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}
