"use client";

import { Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/**
 * The account's DID rendered as a click-to-copy pill. Sits above the username
 * in Account settings: the @handle can change, but the DID never does — it's
 * the stable identifier apps and records reference. The whole pill is the copy
 * target; the icon flips to a check briefly on success.
 */
export default function DidSection({ did }: { did: string | undefined }) {
  const { copied, copy } = useCopyToClipboard();

  if (!did) return null;

  return (
    <button
      type="button"
      className="did-pill"
      onClick={() => void copy(did)}
      aria-label={copied ? "DID copied to clipboard" : "Copy DID to clipboard"}
    >
      <code className="did-pill__value">{did}</code>
      <span className="did-pill__icon" aria-hidden>
        {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
      </span>
    </button>
  );
}
