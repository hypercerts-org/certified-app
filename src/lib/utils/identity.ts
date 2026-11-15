import { profileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"

/** What a list shows for an account with no name and no readable handle. */
export const UNNAMED_ACCOUNT = "Unnamed account"

/**
 * A handle the PDS made up at sign-up: six random letters and digits under
 * certified.one ("1ane6o.certified.one", "howxll.certified.one"). It says
 * nothing to a reader, so it is never shown as a name; the profile's
 * Account card still lists it.
 */
export function isMachineHandle(handle: string | null | undefined): boolean {
  if (!handle) return false
  const h = handle.trim().replace(/^@/, "").toLowerCase()
  return /^[a-z0-9]{6}\.(?:[a-z0-9-]+\.)*certified\.one$/.test(h)
}

/**
 * What to call an account in a list: its name, else a handle a person
 * chose, else "Unnamed account" (`fallback` true, so the row can mute it).
 * A DID or a machine handle is never the name.
 */
export function accountName(
  displayName: string | null | undefined,
  handle: string | null | undefined,
  did?: string | null,
): { name: string; fallback: boolean } {
  const name = displayName?.trim()
  if (name) return { name, fallback: false }
  const h = handle?.trim().replace(/^@/, "") || null
  if (h && h !== did && !h.startsWith("did:") && !isMachineHandle(h)) {
    return { name: h, fallback: false }
  }
  return { name: UNNAMED_ACCOUNT, fallback: true }
}

/**
 * Everything a byline / avatar / profile-link render needs, derived
 * once from a resolved profile. See {@link deriveIdentity}.
 */
export interface DerivedIdentity {
  /** Best display name; with none, a handle a person chose, else
   *  "Unnamed account" (never a DID or a machine handle). */
  displayName: string
  /** `displayName` is the "Unnamed account" fallback (or `fallbackLabel`). */
  unnamed: boolean
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
 * truncated DID). The canonical no-info fallback is "Unnamed account":
 * a list never shows a DID or a machine handle as a name.
 *
 * Notes on the inputs:
 *
 *   - `info.handle` may BE the DID — `useAuthorInfo` falls back to the
 *     DID when resolution fails — so a DID-valued handle is treated as
 *     "no handle" and never surfaces as `@did:plc:…`.
 *   - `opts.preferredName` / `opts.preferredAvatarUrl` are record-level
 *     overrides (e.g. a `NetworkActor`'s own profile fields) that
 *     outrank the resolved info.
 *   - `opts.fallbackLabel` replaces the "Unnamed account" display-name
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
    /** Overrides the "Unnamed account" display-name fallback. */
    fallbackLabel?: string
  },
): DerivedIdentity {
  const rawHandle = info?.handle || null
  const handle =
    rawHandle && rawHandle !== did && rawHandle !== info?.did ? rawHandle : null

  // Best human-readable name, kept separate from the truncated-DID
  // fallback so initials never derive from an opaque DID.
  const bestName = opts?.preferredName || info?.displayName || null
  // A handle the PDS made up names nobody; it is never the name.
  const readableHandle = handle && !isMachineHandle(handle) ? handle : null

  const displayName =
    bestName || readableHandle || opts?.fallbackLabel || UNNAMED_ACCOUNT

  return {
    displayName,
    unnamed: !bestName && !readableHandle,
    handle,
    initials: getInitials(bestName || opts?.fallbackLabel, readableHandle),
    profileHref: profileUrl(handle || did),
    avatarUrl: opts?.preferredAvatarUrl || info?.avatarUrl || null,
  }
}
