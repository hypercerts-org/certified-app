"use client"

import { useEffect, useId, useState } from "react"
import { Plus, X } from "lucide-react"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import {
  DEFAULT_GIFT_BOUNDS,
  MAX_GIFT_BOUNDS,
  giftSizes,
  normalizeGiftBounds,
} from "@/lib/funding/select"

/** "1,000", "$1000" or " 25 " to a number; null when it isn't one. */
function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d+)?$/.test(clean)) return null
  const n = Number(clean)
  return n >= 1 ? n : null
}

/**
 * The Flow's own gift sizes: where each size starts, in dollars, one field
 * per boundary. A field takes effect when it loses focus or on Enter; the
 * boundaries are then sorted and repeats dropped. "Use the default sizes"
 * goes back to under $25, $25 to $99, $100 to $999 and $1,000 and up.
 */
export default function FundingGiftSizes({
  id,
  bounds,
  onChange,
}: {
  id: string
  bounds: readonly number[]
  onChange: (bounds: number[]) => void
}) {
  const titleId = useId()
  const errorId = useId()
  const key = bounds.join("-")
  const [draft, setDraft] = useState<string[]>(() => bounds.map(String))
  const [error, setError] = useState<string | null>(null)
  // Applied boundaries come back sorted: show them as they now are.
  useEffect(() => {
    setDraft(key.split("-"))
    setError(null)
  }, [key])

  const apply = (values: string[]) => {
    const nums = values.map(parseDollars)
    if (nums.some((n) => n === null)) {
      setError("Use whole dollars above zero, like 25 or 1,000.")
      return
    }
    setError(null)
    const next = normalizeGiftBounds(nums as number[])
    if (next.join("-") === key) setDraft(next.map(String))
    else onChange(next)
  }
  const isDefault = key === DEFAULT_GIFT_BOUNDS.join("-")

  return (
    <div id={id} className="funding-sizes" role="group" aria-labelledby={titleId}>
      <div className="funding-sizes__head">
        <p id={titleId} className="funding-sizes__title">
          Gift sizes
        </p>
        <p className="funding-sizes__hint">Where each size starts, in US dollars. Up to {MAX_GIFT_BOUNDS + 1} sizes.</p>
      </div>
      <div className="funding-sizes__fields">
        {draft.map((value, n) => (
          <div key={n} className="funding-sizes__field">
            <Input
              size="sm"
              inputMode="numeric"
              aria-label={`Size ${n + 2} starts at, in dollars`}
              aria-invalid={error !== null && parseDollars(value) === null ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              leadingIcon={<span aria-hidden>$</span>}
              value={value}
              onChange={(e) => {
                const next = [...draft]
                next[n] = e.target.value
                setDraft(next)
              }}
              onBlur={() => apply(draft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  apply(draft)
                }
              }}
            />
            {draft.length > 1 ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove the size that starts at $${value}`}
                onClick={() => apply(draft.filter((_, i) => i !== n))}
              >
                <X size={14} aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {draft.length < MAX_GIFT_BOUNDS ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const last = parseDollars(draft[draft.length - 1] ?? "") ?? 100
              apply([...draft, String(Math.min(last * 10, 100_000_000))])
            }}
          >
            <Plus size={14} aria-hidden />
            Add a size
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="funding-sizes__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="funding-sizes__foot">
        <p className="funding-sizes__preview">{giftSizes(bounds).map((s) => s.label).join(" · ")}</p>
        {!isDefault ? (
          <Button size="sm" variant="ghost" onClick={() => onChange([...DEFAULT_GIFT_BOUNDS])}>
            Use the default sizes
          </Button>
        ) : null}
      </div>
    </div>
  )
}
