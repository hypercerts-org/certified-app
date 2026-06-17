"use client"

import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { HydratedIdentityRow } from "@/components/explore-page/funding-receipt-parts"
import {
  DetailSection,
  DetailRow,
  EmptyValue,
  DateValue,
  CopyableValue,
} from "@/components/explore-page/funding-receipt-detail-modal"
import { useRights } from "@/hooks/use-rights"
import { parseAtUri } from "@/lib/atproto/activity-uri"

/**
 * Read-only detail view for the `org.hypercerts.claim.rights` record an
 * activity references. Opened by clicking the Rights row on the activity
 * detail page. Mirrors the funding-receipt detail modal's chrome and section
 * layout (reusing its `DetailSection` / `DetailRow` building blocks):
 *   1. The rights — name, type, full description.
 *   2. The record — when it was created, by which account, raw at:// URI + CID.
 */
export default function RightsDetailModal({
  uri,
  cid,
  onClose,
}: {
  uri: string
  cid: string
  onClose: () => void
}) {
  const { record, isLoading } = useRights(uri)
  const did = parseAtUri(uri)?.did ?? null

  const rightsName =
    typeof record?.rightsName === "string" ? record.rightsName : null
  const rightsType =
    typeof record?.rightsType === "string" ? record.rightsType : null
  const rightsDescription =
    typeof record?.rightsDescription === "string"
      ? record.rightsDescription
      : null
  const createdAt =
    typeof record?.createdAt === "string" ? record.createdAt : null

  return (
    <AppDialog
      ariaLabel="Rights details"
      className="funding-receipt-detail"
      maxWidth={460}
      onClose={onClose}
    >
      <AppDialogHeader title="Rights" onClose={onClose} />

      <div className="px-5 pb-5 pt-0">
        {isLoading && !record ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <>
            <DetailSection title="Rights" defaultOpen>
              <DetailRow label="Name">
                {rightsName ? rightsName : <EmptyValue />}
              </DetailRow>

              <DetailRow label="Type">
                {rightsType ? rightsType : <EmptyValue />}
              </DetailRow>

              <DetailRow label="Description">
                {rightsDescription ? (
                  <span className="funding-receipt-detail__note">
                    {rightsDescription}
                  </span>
                ) : (
                  <EmptyValue />
                )}
              </DetailRow>
            </DetailSection>

            <DetailSection title="Record">
              <DetailRow label="Created">
                <DateValue iso={createdAt} />
              </DetailRow>

              <DetailRow label="Published by">
                {did ? <HydratedIdentityRow did={did} /> : <EmptyValue />}
              </DetailRow>

              <DetailRow label="Record">
                <CopyableValue value={uri} label="Copy record URI" />
              </DetailRow>

              <DetailRow label="CID">
                <CopyableValue value={cid} label="Copy CID" />
              </DetailRow>
            </DetailSection>
          </>
        )}
      </div>
    </AppDialog>
  )
}
