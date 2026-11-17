"use client"

import { ToggleGroup } from "@/components/ui/segmented-control"
import { CONFIRM_ROLES, type ConfirmRole } from "@/lib/atproto/funding-provenance"
import { confirmRoleHint, confirmRoleLabel } from "@/lib/funding/labels"
import { ROLE_BIT, selectionSentence } from "@/lib/funding/select"
import { formatCount } from "@/lib/funding/format"
import FundingSeal from "./funding-seal"

/**
 * The "Confirmed by" switch: one chip per bucket, each with its mark and how
 * many receipts it holds, so a visitor sees at rest that there is more to
 * turn on. Under it, a sentence that says what is showing. In the page from
 * 800px; in the Filters sheet on phones (funding-page.tsx).
 */
export default function FundingConfirmedBy({
  roles,
  counts,
  shown,
  isDefault,
  onToggle,
  onReset,
}: {
  roles: ReadonlySet<ConfirmRole>
  counts: Record<ConfirmRole, number>
  /** How many receipts the selection shows. */
  shown: number
  isDefault: boolean
  onToggle: (role: ConfirmRole) => void
  onReset: () => void
}) {
  const value = CONFIRM_ROLES.filter((r) => roles.has(r))
  return (
    <div className="funding-confirmed">
      <div className="funding-confirmed__row">
        <span className="funding-confirmed__label">Confirmed by</span>
        <div className="funding-confirmed__scroll">
          <ToggleGroup
            aria-label="Confirmed by"
            className="funding-chips"
            joined={false}
            shape="pill"
            size="md"
            value={value}
            onValueChange={(next) => {
              const nextSet = new Set(next)
              const changed = CONFIRM_ROLES.find((r) => roles.has(r) !== nextSet.has(r))
              if (changed) onToggle(changed)
            }}
            options={CONFIRM_ROLES.map((role) => ({
              value: role,
              tooltip: confirmRoleHint(role),
              icon: <FundingSeal bits={ROLE_BIT[role]} size={14} />,
              label: (
                <>
                  {confirmRoleLabel(role)}
                  <span className="funding-chips__count">{formatCount(counts[role])}</span>
                </>
              ),
            }))}
          />
        </div>
      </div>
      <p className="funding-confirmed__readout" aria-live="polite">
        {selectionSentence(roles, shown)}{" "}
        {isDefault ? (
          <span className="funding-confirmed__default">This is the default.</span>
        ) : (
          <button type="button" className="funding-confirmed__reset" onClick={onReset}>
            Back to the default
          </button>
        )}
      </p>
    </div>
  )
}
