"use client"

import { X } from "lucide-react"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"
import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "@/components/endorsements/endorsement-subject-row"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deriveIdentity } from "@/lib/utils/identity"

interface EndorsementRowProps {
  /** The DID of the endorsed account. */
  readonly subjectDid: string
  /** ISO timestamp of when the endorsement was created. */
  readonly createdAt: string
  /** Optional issuer-provided note (badge.award.note). Shown under
   *  the subject's display name when present. */
  readonly note?: string
  /** If provided, the row renders a revoke button that calls this
   *  callback. Used on the "Given" list for the viewer's own
   *  endorsements. */
  readonly onRevoke?: () => void | Promise<void>
  /** Disable the revoke button while a write is in flight. */
  readonly isRevoking?: boolean
}

const ROW_CLASSES: EndorsementSubjectRowClasses = {
  main: "endorsement-row__main",
  meta: "endorsement-row__meta",
  name: "endorsement-row__name",
  handle: "endorsement-row__handle",
  note: "endorsement-row__note",
  date: "endorsement-row__date",
}

/**
 * Single row in an endorsements list. Hydrates the subject DID into
 * avatar + display name + handle via `useAuthorInfo` (same hook
 * powering activity card bylines) and renders the shared
 * `EndorsementSubjectRow`, which links through to the subject's
 * profile page. Optionally shows a revoke button.
 */
export default function EndorsementRow({
  subjectDid,
  createdAt,
  note,
  onRevoke,
  isRevoking,
}: EndorsementRowProps) {
  const { info, isLoading } = useAuthorInfo(subjectDid)
  // Same derivation the shared row renders, so the revoke aria-label
  // matches the visible display name.
  const { displayName } = deriveIdentity(info, subjectDid)

  return (
    <li className="endorsement-row">
      <EndorsementSubjectRow
        did={subjectDid}
        info={info}
        isLoading={isLoading}
        createdAt={createdAt}
        note={note}
        classes={ROW_CLASSES}
        trailing={
          onRevoke ? (
            <Tooltip label="Revoke endorsement">
              <button
                type="button"
                className="endorsement-row__revoke"
                onClick={onRevoke}
                disabled={isRevoking}
                aria-label={`Revoke endorsement of ${displayName}`}
              >
                {isRevoking ? <LoadingSpinner size="sm" /> : <X size={16} />}
              </button>
            </Tooltip>
          ) : null
        }
      />
    </li>
  )
}
