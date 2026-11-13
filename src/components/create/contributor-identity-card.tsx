"use client"

import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useContributorInfo } from "@/hooks/use-contributor-info"
import { deriveIdentity } from "@/lib/utils/identity"
import { isDid } from "@/lib/utils/did"

interface ContributorIdentityCardProps {
  /** Normalised identity string (DID or handle without leading `@`). */
  identity: string
  ariaLabel: string
}

/**
 * Resolved-contributor card — the "picked" state of the cert form's
 * contributor row. Once the user has typed (or autocompleted) a
 * recognisable identity, the typeahead input is swapped out for this
 * card so the row reads as "this is who you added" with avatar +
 * display name + handle. The row's one remove button (beside the card)
 * takes the contributor off the list; there is no second "clear" control.
 *
 * Mirrors the read-mode `ActivityContributor` card visually so the
 * editor and the published cert page render the same compact row.
 */
export function ContributorIdentityCard({
  identity,
  ariaLabel,
}: ContributorIdentityCardProps) {
  const { info, isLoading } = useContributorInfo(identity)

  // `identity` is a handle-or-DID string: a handle stays the display
  // fallback while resolution is pending / failed; a DID falls through
  // to deriveIdentity's canonical truncated-DID fallback.
  const { displayName, handle, initials } = deriveIdentity(
    info,
    info?.did ?? identity,
    { fallbackLabel: isDid(identity) ? undefined : identity },
  )

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
    </div>
  )
}
