"use client"

import Link from "next/link"
import { User } from "lucide-react"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge, {
  type ViaIdentityMap,
} from "./endorsement-row-badge"

/**
 * Dense single-row representation of an account for the /explore list
 * view. Reuses the `.cert-list-row` visual chrome (hover, padding,
 * thumb size, body typography) but skips the time column — accounts
 * don't carry a relative-time signal in this listing. The
 * `cert-list-row--account` modifier widens the grid into 2 columns
 * (link block · handle column).
 *
 * When `endorsementMeta` is present (certified-app #84), the degree
 * label renders inline right before the handle, separated by a middle
 * dot. Clicking the degree (degrees 2 / 3 only) reveals the via list
 * in a popover.
 */
export default function AccountListRow({
  actor,
  endorsementMeta,
  endorsementCorroboration,
  endorsementIdentities,
}: {
  actor: NetworkActor
  endorsementMeta?: EndorsementClosureAccount
  endorsementCorroboration?: Map<string, number>
  endorsementIdentities?: ViaIdentityMap
}) {
  const handle = actor.did.startsWith("did:plc:")
    ? `${actor.did.slice(8, 14)}…${actor.did.slice(-4)}`
    : actor.did
  const initial = (actor.displayName ?? actor.did.slice(8))
    .charAt(0)
    .toUpperCase()
  return (
    <article className="cert-list-row cert-list-row--account">
      <Link
        href={`/profile/${encodeURIComponent(actor.did)}`}
        className="cert-list-row__link"
      >
        <div className="cert-list-row__thumb cert-list-row__thumb--avatar">
          {actor.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={actor.avatarUrl}
              alt=""
              className="cert-list-row__img"
              loading="lazy"
            />
          ) : actor.displayName ? (
            <span className="cert-list-row__avatar-initial">{initial}</span>
          ) : (
            <User
              size={18}
              strokeWidth={1.25}
              aria-hidden
              className="cert-list-row__img-fallback"
            />
          )}
        </div>
        <div className="cert-list-row__body">
          <h3 className="cert-list-row__title">
            {actor.displayName ?? handle}
          </h3>
          {actor.description ? (
            <p className="cert-list-row__meta">
              <span className="cert-list-row__meta-item">
                {actor.description}
              </span>
            </p>
          ) : null}
        </div>
      </Link>

      <div className="cert-list-row__author-col">
        <span className="cert-list-row__handle">
          {endorsementMeta && endorsementCorroboration && endorsementIdentities ? (
            <>
              <EndorsementRowBadge
                meta={endorsementMeta}
                corroboration={endorsementCorroboration}
                identityMap={endorsementIdentities}
              />
              <span className="endorsement-row-badge__sep" aria-hidden>
                {" · "}
              </span>
            </>
          ) : null}
          {handle}
        </span>
      </div>
    </article>
  )
}
