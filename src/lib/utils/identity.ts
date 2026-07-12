import { profileUrl } from "@/lib/urls"
import { truncateDid } from "@/lib/utils/did"
import { getInitials } from "@/lib/utils/initials"

/**
 * Everything a byline / avatar / profile-link render needs, derived
 * once from a resolved profile. See {@link deriveIdentity}.
 */
export interface DerivedIdentity {
  /** Best display name; canonical fallback is `truncateDid(did)`. */
  displayName: string
  /** The handle when it exists and differs from the DID, else null. */
  handle: string | null
  /** Avatar-fallback initials via `getInitials`. */
  initials: string
  /** In-app profile link — handle preferred, DID fallback. */
  profileHref: string
  avatarUrl: string | null
}

/**
 * Derive the display name / handle / initials / profile href / avatar
 * for one account from a `useAuthorInfo` result (or any structurally
 * compatible resolved profile).
 *
 * Centralises the 3–4-line derivation that used to be copy-pasted per
 * byline with drifting fallbacks (raw DID vs. "Anonymous" vs.
 * truncated DID). The canonical no-info fallback is `truncateDid(did)`.
 *
 * Notes on the inputs:
 *
 *   - `info.handle` may BE the DID — `useAuthorInfo` falls back to the
 *     DID when resolution fails — so a DID-valued handle is treated as
 *     "no handle" and never surfaces as `@did:plc:…`.
 *   - `opts.preferredName` / `opts.preferredAvatarUrl` are record-level
 *     overrides (e.g. a `NetworkActor`'s own profile fields) that
 *     outrank the resolved info.
 *   - `opts.fallbackLabel` replaces the `truncateDid(did)` display-name
 *     fallback for the rare surface that wants e.g. "Anonymous".
 */
export function deriveIdentity(
  info: {
    did?: string
    handle?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null,
  did: string,
  opts?: {
    /** Record-level display name that outranks the resolved info. */
    preferredName?: string | null
    /** Record-level avatar URL that outranks the resolved info. */
    preferredAvatarUrl?: string | null
    /** Overrides the `truncateDid(did)` display-name fallback. */
    fallbackLabel?: string
  },
): DerivedIdentity {
  const rawHandle = info?.handle || null
  const handle =
    rawHandle && rawHandle !== did && rawHandle !== info?.did ? rawHandle : null

  // Best human-readable name, kept separate from the truncated-DID
  // fallback so initials never derive from an opaque DID.
  const bestName = opts?.preferredName || info?.displayName || null

  const displayName =
    bestName || handle || opts?.fallbackLabel || truncateDid(did)

  return {
    displayName,
    handle,
    initials: getInitials(bestName || opts?.fallbackLabel, handle),
    profileHref: profileUrl(handle || did),
    avatarUrl: opts?.preferredAvatarUrl || info?.avatarUrl || null,
  }
}
