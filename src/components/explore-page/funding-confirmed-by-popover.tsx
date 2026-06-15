"use client"

import { useCallback, useMemo } from "react"
import { UserRoundCheck } from "lucide-react"
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "@/components/ui/popover"
import Tooltip from "@/components/ui/tooltip"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { thirdPartyDids } from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"

/** Short `did:plc:abcd…wxyz` fallback when a candidate has no resolved
 *  handle/display name yet. */
function shortDid(did: string): string {
  if (did.length <= 20) return did
  return `${did.slice(0, 12)}…${did.slice(-4)}`
}

/**
 * /explore Funding "Confirmed by" filter — narrows the list to payments a
 * specific **third-party** attestor confirmed (the indexer's `confirmedBy`
 * arg; recipient/sender filtering is already the From/To account filter).
 *
 * Candidates are the distinct third-party attestors present in the loaded
 * receipts. Because the filter is server-side, once one is active the list
 * collapses to that attestor — so the active selection is always offered
 * (checked) plus a "Clear" item to widen again.
 */
export default function FundingConfirmedByPopover({
  receipts,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  receipts: FundingReceipt[]
  value: string | null
  onChange: (did: string | null) => void
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  // Distinct third-party attestors seen in the current result set, plus
  // the active selection (which may be the only thing in `receipts` once
  // the server filter is applied).
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const push = (did: string) => {
      if (seen.has(did)) return
      seen.add(did)
      out.push(did)
    }
    if (value) push(value)
    for (const r of receipts) for (const did of thirdPartyDids(r.attestations)) push(did)
    return out
  }, [receipts, value])

  // Minifier-safe selection (reads the DID off the clicked element's
  // dataset rather than capturing the map variable — same pattern the
  // sidebar filter buttons use). Empty `data-did` clears the filter.
  const onItemClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const did = e.currentTarget.dataset.did
      onChange(did ? did : null)
      onOpenChange(false)
    },
    [onChange, onOpenChange],
  )

  const active = !!value
  // Nothing to filter by and no active selection → don't render a dead
  // control (mirrors hiding the quality popover on funding).
  if (candidates.length === 0 && !active) return null

  return (
    <UiPopover open={open} onOpenChange={onOpenChange}>
      <Tooltip label="Filter by confirmer">
        <PopoverTrigger>
          <button
            type="button"
            className={`explore__chrome-btn explore__chrome-btn--icon${
              active ? " explore__chrome-btn--active" : ""
            }`}
            aria-label={`Filter by confirmer${active ? " (filtered)" : ""}`}
          >
            <UserRoundCheck size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end">
        <p className="popover__section-heading">Confirmed by</p>
        {active ? (
          <PopoverItem data-did="" onClick={onItemClick}>
            All confirmers
          </PopoverItem>
        ) : null}
        {candidates.map((did) => (
          <ConfirmerItem
            key={did}
            did={did}
            selected={did === value}
            onClick={onItemClick}
          />
        ))}
      </PopoverContent>
    </UiPopover>
  )
}

/** One attestor row — hydrates avatar + name from the DID. */
function ConfirmerItem({
  did,
  selected,
  onClick,
}: {
  did: string
  selected: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const { info } = useAuthorInfo(did)
  const name = info?.displayName || info?.handle || shortDid(did)
  return (
    <PopoverItem data-did={did} selected={selected} onClick={onClick}>
      <span className="funding-confirmer-item">
        <Avatar src={info?.avatarUrl ?? undefined} size="sm" alt="" />
        <span className="funding-confirmer-item__name">{name}</span>
      </span>
    </PopoverItem>
  )
}
