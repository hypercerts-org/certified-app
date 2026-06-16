"use client"

import { useId, useMemo } from "react"
import { UserRoundCheck } from "lucide-react"
import {
  Popover as UiPopover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import Tooltip from "@/components/ui/tooltip"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import { HydratedIdentityRow } from "./funding-receipt-parts"
import {
  CONFIRM_ROLES,
  thirdPartyDids,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"

const ROLE_LABEL: Record<ConfirmRole, string> = {
  both: "Both",
  sender: "Funder",
  recipient: "Recipient",
}

/**
 * /explore Funding "Confirmed by" filter — two checkbox sections:
 *
 *   Confirmed by               (role buckets: Both / Sender / Recipient)
 *   Confirmed by third parties (one checkbox per distinct third-party
 *                               attestor in the loaded receipts)
 *
 * The shown list is the UNION of everything checked; with nothing checked
 * nothing shows. Default has the three role buckets checked and no third
 * parties — applied client-side (see `matchesConfirmedBy`), since the role
 * buckets aren't a single indexer arg.
 */
export default function FundingConfirmedByPopover({
  receipts,
  roles,
  onToggleRole,
  thirdParties,
  onToggleThirdParty,
  isDefault,
  onReset,
  open,
  onOpenChange,
  triggerVariant = "chrome",
}: {
  /** Full loaded result set — the source of third-party candidates. */
  receipts: FundingReceipt[]
  roles: ReadonlySet<ConfirmRole>
  onToggleRole: (role: ConfirmRole) => void
  thirdParties: ReadonlySet<string>
  onToggleThirdParty: (did: string) => void
  /** Whether the selection equals the default (all roles, no third parties). */
  isDefault: boolean
  /** Restore the default selection (all roles, no third parties). */
  onReset: () => void
  open: boolean
  onOpenChange: (v: boolean) => void
  /** "chrome" — the /explore toolbar icon button (default). "section" — a
   *  labelled secondary button matching the "Record funding" action on the
   *  activity-detail Funding header. */
  triggerVariant?: "chrome" | "section"
}) {
  // Associate each checkbox section with its visible label for AT (the
  // popover renders role="group", not a menu).
  const rolesHeadingId = useId()
  const tpHeadingId = useId()

  // Distinct third-party attestors across the loaded receipts, plus any
  // currently-selected DIDs (so a selection stays listed even if its rows
  // scroll out of the loaded window).
  //
  // The candidate list — and the filtering itself (`matchesConfirmedBy`) —
  // is intentionally scoped to the loaded window: the server-side
  // `confirmedBy` arg that would push this filter upstream is plumbed
  // through `fetchFundingReceipts` -> the indexer GraphQL op but stays
  // dormant until magic-indexer #214 ships it (the real filter is a
  // multi-axis role-bucket + DID set, which the single nullable-DID arg
  // can't yet express). That plumbing is deliberately kept, not dead code.
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const push = (did: string) => {
      if (seen.has(did)) return
      seen.add(did)
      out.push(did)
    }
    for (const did of thirdParties) push(did)
    for (const r of receipts) for (const did of thirdPartyDids(r.attestations)) push(did)
    return out
  }, [receipts, thirdParties])

  return (
    <UiPopover open={open} onOpenChange={onOpenChange}>
      <Tooltip label="Filter by confirmer">
        <PopoverTrigger>
          {triggerVariant === "section" ? (
            <Button
              variant="secondary"
              size="sm"
              pressed={!isDefault}
              className="cert-detail__section-action-btn"
              aria-label={`Filter by confirmer${isDefault ? "" : " (filtered)"}`}
            >
              <UserRoundCheck size={14} strokeWidth={1.75} aria-hidden />
            </Button>
          ) : (
            <button
              type="button"
              className={`explore__chrome-btn explore__chrome-btn--icon${
                isDefault ? "" : " explore__chrome-btn--active"
              }`}
              aria-label={`Filter by confirmer${isDefault ? "" : " (filtered)"}`}
            >
              <UserRoundCheck size={13} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" role="group" aria-label="Confirmed by filter">
        <div role="group" aria-labelledby={rolesHeadingId}>
          <p id={rolesHeadingId} className="popover__section-heading">
            Confirmed by
          </p>
          {CONFIRM_ROLES.map((role) => (
            <div key={role} className="popover__item popover__item--check">
              <Checkbox
                label={ROLE_LABEL[role]}
                checked={roles.has(role)}
                onChange={() => onToggleRole(role)}
              />
            </div>
          ))}
        </div>
        {candidates.length > 0 ? (
          <>
            <hr className="popover__divider" aria-hidden="true" />
            <div role="group" aria-labelledby={tpHeadingId}>
              <p id={tpHeadingId} className="popover__section-heading">
                Confirmed by third parties
              </p>
              {candidates.map((did) => (
                <ThirdPartyCheck
                  key={did}
                  did={did}
                  checked={thirdParties.has(did)}
                  onToggle={onToggleThirdParty}
                />
              ))}
            </div>
          </>
        ) : null}
        <hr className="popover__divider" aria-hidden="true" />
        <button
          type="button"
          className="popover__reset-btn"
          onClick={onReset}
          disabled={isDefault}
        >
          Reset to default
        </button>
      </PopoverContent>
    </UiPopover>
  )
}

/** One third-party attestor checkbox — hydrates the account to the canonical
 *  identity row (avatar + display name + @handle below). */
function ThirdPartyCheck({
  did,
  checked,
  onToggle,
}: {
  did: string
  checked: boolean
  onToggle: (did: string) => void
}) {
  return (
    <div className="popover__item popover__item--check">
      <Checkbox
        checked={checked}
        onChange={() => onToggle(did)}
        label={
          <HydratedIdentityRow
            did={did}
            className="funding-confirmer-item"
            noLink
          />
        }
      />
    </div>
  )
}
