"use client"

import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import { X } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Skeleton from "@/components/ui/skeleton"
import Tooltip from "@/components/ui/tooltip"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import { formatShortDate } from "@/lib/utils/format-date"

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

/**
 * Single row in an endorsements list. Hydrates the subject DID into
 * avatar + display name + handle via `useAuthorInfo` (same hook
 * powering activity card bylines), and links through to the
 * subject's profile page. Optionally shows a revoke button.
 */
export default function EndorsementRow({
  subjectDid,
  createdAt,
  note,
  onRevoke,
  isRevoking,
}: EndorsementRowProps) {
  const { info, isLoading } = useAuthorInfo(subjectDid)

  const displayName = info?.displayName || info?.handle || subjectDid
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, subjectDid)
  const href = profileUrl(info?.handle || subjectDid)

  return (
    <li className="endorsement-row">
      <Link href={href} className="endorsement-row__main">
        {isLoading && !info ? (
          <Skeleton circle animate={false} width={48} height={48} />
        ) : (
          <Avatar
            size="md"
            src={info?.avatarUrl || undefined}
            alt=""
            fallbackInitials={initials}
          />
        )}
        <div className="endorsement-row__meta">
          <span className="endorsement-row__name">{displayName}</span>
          {handle ? (
            <span className="endorsement-row__handle">@{handle}</span>
          ) : null}
          {note ? <span className="endorsement-row__note">{note}</span> : null}
        </div>
      </Link>
      <time
        dateTime={createdAt}
        className="endorsement-row__date"
        title={new Date(createdAt).toLocaleString()}
      >
        {formatShortDate(createdAt)}
      </time>
      {onRevoke ? (
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
      ) : null}
    </li>
  )
}
