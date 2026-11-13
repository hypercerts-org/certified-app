"use client"

import { Radio, RadioGroup } from "@/components/ui/radio"
import { useCustomLooks } from "@/lib/look/custom-looks"
import { LOOKS, isLookId, useLook, type AnyLookId } from "@/lib/look/looks"

/** An initials avatar shaped like `<Avatar>`'s fallback (a ring around a
 *  fill), carrying the avatar centerpiece hooks so each style redraws it.
 *  Spans, since the preview sits inside the tile's button. */
function PreviewAvatar({
  initials,
  shape,
  size,
}: {
  initials: string
  shape: "circle" | "square"
  size: "sm" | "xs"
}) {
  const round = shape === "circle" ? "rounded-full" : "rounded"
  return (
    <span
      data-centerpiece="avatar"
      data-shape={shape}
      data-fallback=""
      className={`relative inline-flex shrink-0 items-center justify-center bg-[var(--border-hover)] p-[1.5px] ${round} ${size === "sm" ? "size-8" : "size-5"}`}
    >
      <span
        className={`flex size-full items-center justify-center bg-[var(--color-surface-container-high)] font-semibold text-[var(--fg-primary)] ${round} ${size === "sm" ? "text-[0.625rem]" : "text-[0.5rem]"}`}
      >
        {initials}
      </span>
    </span>
  )
}

/**
 * A live sample of one style, drawn with that style's own tokens and
 * centerpieces (`data-look-preview`, looks.css) in the current light/dark
 * mode: a miniature Overview with the account's avatar and name, its ID
 * card, two numbers, and an endorsement with a note. Decorative; the tile
 * names the style.
 */
function LookPreview({ id }: { id: AnyLookId }) {
  return (
    <span
      data-look-preview={id}
      aria-hidden
      className="flex flex-1 flex-col gap-2.5 bg-[var(--bg-canvas)] p-3 text-left text-[var(--fg-secondary)] [background-image:var(--look-backdrop)] [background-size:var(--look-backdrop-size)] [font-family:var(--font-inter)]"
    >
      <span className="flex items-center gap-2.5">
        <PreviewAvatar initials="UT" shape="circle" size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="font-headline truncate text-body leading-tight text-[var(--fg-primary)] [font-weight:var(--weight-headline,600)]">
            Upper Tana Trust
          </span>
          <span className="truncate text-caption text-[var(--fg-muted)]">@uppertana.org</span>
        </span>
      </span>

      <span
        data-centerpiece="id"
        data-did="did:plc:7xq3m2k4vb5ntq2a6wze"
        className="relative block overflow-hidden rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-2"
      >
        <span data-part="title" className="block text-caption font-semibold text-[var(--fg-primary)]">
          ID
        </span>
        <span className="mt-1 block truncate rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[0.6875rem] text-[var(--fg-primary)] [font-family:var(--font-mono)]">
          did:plc:7xq3m2k4vb5ntq2a6wze
        </span>
      </span>

      <span className="flex gap-5">
        {[
          ["128", "Activities"],
          ["14", "Endorsed"],
        ].map(([value, label]) => (
          <span key={label} className="flex flex-col gap-0.5">
            <span className="text-h4 leading-none tabular-nums text-[var(--fg-primary)] [font-family:var(--font-numeral)]">
              {value}
            </span>
            <span className="text-label text-[var(--fg-muted)]">{label}</span>
          </span>
        ))}
      </span>

      <span
        data-centerpiece="endorsement"
        className="flex items-start gap-2 border-t border-[var(--border-subtle)] pt-2"
      >
        <PreviewAvatar initials="ME" shape="square" size="xs" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-caption">
            <span data-part="who" className="font-medium text-[var(--fg-primary)]">
              Ma Earth
            </span>{" "}
            <span data-part="when" className="text-[var(--fg-muted)]">
              2026-11-04
            </span>
          </span>
          <span data-part="note" className="text-caption text-[var(--fg-secondary)]">
            A reliable partner on the tree nursery.
          </span>
        </span>
      </span>
    </span>
  )
}

function LookTile({
  id,
  name,
  description,
  selected,
}: {
  id: AnyLookId
  name: string
  description: string
  selected: boolean
}) {
  const descId = `look-${id}-description`
  return (
    <Radio
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
}

/**
 * Settings → Appearance → Style: one tile per style, each a live preview
 * over its name and one line about it, then the styles made from websites
 * in this browser (custom-look-maker.tsx). Picking applies the style at
 * once and keeps it in this browser (`useLook`).
 */
export default function LookPicker() {
  const [look, setLook] = useLook()
  const made = useCustomLooks()
  return (
    <RadioGroup
      value={look}
      onValueChange={(v) => {
        if (isLookId(v)) setLook(v)
        else {
          const custom = made.find((l) => l.id === v)
          if (custom) setLook(custom.id)
        }
      }}
      aria-label="Style"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {LOOKS.map(({ id, name, description }) => (
        <LookTile key={id} id={id} name={name} description={description} selected={look === id} />
      ))}
      {made.map(({ id, spec, source }) => (
        <LookTile
          key={id}
          id={id}
          name={spec.name}
          description={spec.description ? `${spec.description} From ${source}.` : `Made from ${source}.`}
          selected={look === id}
        />
      ))}
    </RadioGroup>
  )
}
