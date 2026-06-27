"use client";

import { Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/**
 * A click-to-copy pill: the whole control copies `value`, and the icon flips to
 * a check briefly on success. Used for identifiers people paste elsewhere — the
 * DID and the handle. `display` overrides the shown text (e.g. show "@handle"
 * but copy the bare handle); `inline` sizes it to content instead of full-width.
 */
export default function CopyPill({
  value,
  display,
  label,
  inline = false,
}: {
  value: string | undefined;
  display?: string;
  label: string;
  inline?: boolean;
}) {
  const { copied, copy } = useCopyToClipboard();

  if (!value) return null;

  return (
    <button
      type="button"
      className={`did-pill${inline ? " did-pill--inline" : ""}`}
      onClick={() => void copy(value)}
      aria-label={
        copied ? `${label} copied to clipboard` : `Copy ${label} to clipboard`
      }
    >
      <code className="did-pill__value">{display ?? value}</code>
      <span className="did-pill__icon" aria-hidden>
        {copied ? (
          <Check size={14} strokeWidth={2} />
        ) : (
          <Copy size={14} strokeWidth={1.75} />
        )}
      </span>
    </button>
  );
}
