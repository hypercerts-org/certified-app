"use client"

import { X } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"
import { useContributorInfo } from "@/hooks/use-contributor-info"
import { getInitials } from "@/lib/utils/initials"

interface ContributorIdentityCardProps {
  /** Normalised identity string (DID or handle without leading `@`). */
  identity: string
  /** Clears the row's identity field, reverting the caller to the
   *  typeahead input. The cert form's row carries its own trash
   *  button for removing the whole row; this X only edits identity. */
  onClear: () => void
  ariaLabel: string
}

/**
 * Resolved-contributor card — the "picked" state of the cert form's
 * contributor row. Once the user has typed (or autocompleted) a
 * recognisable identity, the typeahead input is swapped out for this
 * card so the row reads as "this is who you added" with avatar +
 * display name + handle. Clicking the X clears the identity and
 * brings the typeahead back.
 *
 * Mirrors the read-mode `ActivityContributor` card visually so the
 * editor and the published cert page render the same compact row.
 */
export function ContributorIdentityCard({
  identity,
  onClear,
  ariaLabel,
}: ContributorIdentityCardProps) {
  const { info, isLoading } = useContributorInfo(identity)

  const displayName = info?.displayName || info?.handle || identity
  const handle =
    info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName ?? null, info?.did ?? identity)

  return (
    <div
      className="create-cert__contrib-card"
      role="group"
      aria-label={ariaLabel}
    >
      <Avatar
        size="sm"
        src={info?.avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
      />
      <span className="create-cert__contrib-card-meta">
        <span className="create-cert__contrib-card-name">
          {isLoading && !info ? identity : displayName}
        </span>
        {handle ? (
          <span className="create-cert__contrib-card-handle">@{handle}</span>
        ) : isLoading ? (
          <LoadingSpinner size="sm" />
        ) : null}
      </span>
      <Tooltip label="Change">
        <button
          type="button"
          className="create-cert__contrib-card-clear"
          onClick={onClear}
          aria-label={`Change ${displayName}`}
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>
    </div>
  )
}
