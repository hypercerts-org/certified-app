"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Tooltip from "@/components/ui/tooltip"
import { useEnsName } from "@/hooks/use-ens-name"
import { isEthereumAddress, shortenAddress } from "@/lib/ens/resolve-ens"
import { getInitials } from "@/lib/utils/initials"

/**
 * Inline, copyable representation of an Ethereum wallet address.
 *
 *   <WalletAddress address="0xE64a…5D51" />
 *
 * When the address reverse-resolves to a primary ENS name it shows the
 * name (e.g. `vitalik.eth`) — with the ENS avatar when `showAvatar` is set,
 * mirroring how an AT Protocol account renders avatar + name; otherwise it
 * shows the shortened `0x1234…abcd` form. Either way the full address
 * surfaces in a tooltip on hover, and clicking copies the full address to
 * the clipboard with a brief "Copied" confirmation. Built as a generic
 * primitive — the funding receipt list is the first consumer, but
 * accounts / transfers / receipts elsewhere can drop it in.
 *
 * A value that isn't a syntactically valid address renders as plain text
 * (no ENS lookup, no copy affordance), so callers can pass any
 * funding-party string without pre-checking.
 */
export interface WalletAddressProps {
  /** Raw 0x-prefixed address (or arbitrary text, which renders verbatim). */
  address: string
  /** Show the ENS avatar (when one resolves) before the name. Default true. */
  showAvatar?: boolean
  /** Extra classes on the root element. */
  className?: string
  /** Tooltip side. Default "top". */
  tooltipSide?: "top" | "bottom"
}

export default function WalletAddress({
  address,
  showAvatar = true,
  className = "",
  tooltipSide = "top",
}: WalletAddressProps) {
  const valid = isEthereumAddress(address)
  const { name, avatar } = useEnsName(valid ? address : null)
  const [copied, setCopied] = useState(false)

  if (!valid) {
    // Not an address — render the literal value, no affordances.
    return <span className={`wallet-address__plain ${className}`.trim()}>{address}</span>
  }

  const display = name ?? shortenAddress(address)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — silent */
    }
  }

  return (
    <Tooltip label={copied ? "Copied" : address} side={tooltipSide}>
      <button
        type="button"
        className={`wallet-address ${className}`.trim()}
        onClick={onCopy}
        aria-label={copied ? "Copied address" : `Copy address ${address}`}
        data-ens={name ? "" : undefined}
      >
        {showAvatar && avatar ? (
          <Avatar
            size="sm"
            src={avatar}
            alt=""
            fallbackInitials={getInitials(name, address)}
            className="wallet-address__avatar"
          />
        ) : null}
        <span className="wallet-address__label">{display}</span>
        <span className="wallet-address__copy" aria-hidden>
          {copied ? (
            <Check size={12} strokeWidth={2} />
          ) : (
            <Copy size={12} strokeWidth={1.75} />
          )}
        </span>
      </button>
    </Tooltip>
  )
}
