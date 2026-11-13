"use client"

import { Radio, RadioGroup } from "@/components/ui/radio"
import { LOOKS, isLookId, useLook, type LookId } from "@/lib/look/looks"

/**
 * A live sample of one style, drawn with that style's own tokens
 * (`data-look-preview`, looks.css) in the current light/dark mode: its
 * page, a card with a title in its display face, a number in its numeral
 * face, a button and a label. Decorative; the tile names the style.
 */
function LookPreview({ id }: { id: LookId }) {
  return (
    <span
      data-look-preview={id}
      aria-hidden
      className="block bg-[var(--bg-canvas)] p-3 text-left text-[var(--fg-secondary)] [background-image:var(--look-backdrop)] [background-size:var(--look-backdrop-size)] [font-family:var(--font-inter)]"
    >
      <span className="flex items-center gap-3 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] p-2.5 shadow-[var(--shadow-sm)]">
        <span className="font-headline text-h4 leading-none text-[var(--fg-primary)]">Aa</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="block h-1.5 w-4/5 rounded bg-[var(--fg-primary)] opacity-80" />
          <span className="block h-1.5 w-3/5 rounded bg-[var(--fg-muted)] opacity-60" />
        </span>
        <span className="text-h4 tabular-nums leading-none text-[var(--fg-primary)] [font-family:var(--font-numeral)]">
          128
        </span>
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2">
        <span className="rounded bg-[var(--btn-primary-bg)] px-2.5 py-1 text-caption font-medium text-[var(--btn-primary-fg)]">
          Endorse
        </span>
        <span className="text-label text-[var(--fg-muted)]">Activity</span>
      </span>
    </span>
  )
}

/**
 * Settings → Appearance → Style: one tile per style, each a live preview
 * over its name and one line about it. Picking applies the style at once
 * and keeps it in this browser (`useLook`).
 */
export default function LookPicker() {
  const [look, setLook] = useLook()
  return (
    <RadioGroup
      value={look}
      onValueChange={(v) => {
        if (isLookId(v)) setLook(v)
      }}
      aria-label="Style"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {LOOKS.map(({ id, name, description }) => {
        const selected = look === id
        const descId = `look-${id}-description`
        return (
          <Radio
            key={id}
            value={id}
            aria-label={name}
            aria-describedby={descId}
            className={[
              "flex-col items-stretch gap-0 overflow-hidden border p-0 text-left",
              selected
                ? "border-[var(--fg-primary)] shadow-[var(--shadow-ring-medium)]"
                : "border-[var(--border-default)] hover:border-[var(--border-hover)]",
            ].join(" ")}
          >
            <LookPreview id={id} />
            <span className="flex flex-col gap-0.5 border-t border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <span className="text-body-sm font-medium text-[var(--fg-primary)]">{name}</span>
              <span id={descId} className="text-caption text-[var(--fg-muted)]">
                {description}
              </span>
            </span>
          </Radio>
        )
      })}
    </RadioGroup>
  )
}
