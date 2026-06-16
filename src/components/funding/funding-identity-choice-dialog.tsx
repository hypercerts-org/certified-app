"use client"

import AppDialog, {
  AppDialogHeader,
  AppDialogBody,
} from "@/components/ui/app-dialog"
import { HydratedIdentityRow } from "@/components/explore-page/funding-receipt-parts"

/** Which identity a funding receipt is authored as. */
export type RecordFundingAs = "individual" | "group"

/**
 * Asks an owner/admin of the activity's authoring group whether to record the
 * funding as themselves or as the group, before opening the record form. The
 * chosen identity becomes the receipt's author — recording as the group lets
 * it be logged as the recipient of the funding.
 */
export default function FundingIdentityChoiceDialog({
  individualDid,
  groupDid,
  onChoose,
  onClose,
}: {
  individualDid: string
  groupDid: string
  onChoose: (as: RecordFundingAs) => void
  onClose: () => void
}) {
  return (
    <AppDialog
      ariaLabel="Record funding as"
      className="funding-form"
      maxWidth={400}
      onClose={onClose}
    >
      <AppDialogHeader title="Record funding as" onClose={onClose} />
      <AppDialogBody>
        <div className="funding-form__body">
          <p className="funding-form__confirm-lede">
            Record this funding as yourself, or as the group that owns this
            activity.
          </p>
          <div className="funding-identity-choice">
            <button
              type="button"
              className="funding-identity-choice__option"
              onClick={() => onChoose("individual")}
            >
              <HydratedIdentityRow did={individualDid} noLink />
            </button>
            <button
              type="button"
              className="funding-identity-choice__option"
              onClick={() => onChoose("group")}
            >
              <HydratedIdentityRow did={groupDid} noLink />
            </button>
          </div>
        </div>
      </AppDialogBody>
    </AppDialog>
  )
}
