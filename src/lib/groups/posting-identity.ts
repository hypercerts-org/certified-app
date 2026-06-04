import type { Group, OrgRole } from "./types"
import { ownedOrAdminGroups } from "./managed"

/**
 * Per-action "posting as" model.
 *
 * The org-identity write model is per-action: every create/award/endorse
 * picks WHICH repo it lands in at the moment of writing, rather than
 * inheriting a sticky "active org" from the switcher. This module is the
 * shared shape + option builder that the per-action picker
 * (`<PostingAs>` / `usePostingIdentity`) feeds, and that the write seam
 * (`writeToRepo({ targetDid })`) ultimately consumes.
 *
 * A `PostingIdentity` is the viewer themselves (`kind: 'personal'`) or a
 * group they can author into (`kind: 'group'`). The `did` is the target
 * repo DID — the viewer's own DID for personal, the group's DID for a
 * group — so a caller can hand it straight to `targetDid` without any
 * further lookup.
 */
export type PostingIdentity = {
  /** Target repo DID — viewer's own DID (personal) or the group's DID. */
  did: string
  kind: "personal" | "group"
  /** Display label — "You" for personal, the group's name for a group. */
  label: string
  /** Resolved handle (without leading @), when known. */
  handle?: string
  avatarUrl?: string
  /** The viewer's role on the group (group identities only). */
  role?: OrgRole
}

/**
 * Groups the viewer may author records INTO. Writing a group-authored
 * record requires `owner` or `admin` on that group — `member` is
 * read/participate-only — so this is exactly {@link ownedOrAdminGroups},
 * the single source of truth for the owner|admin write gate. Re-exported
 * through this name so posting-as callers don't have to know it lives in
 * `managed.ts`. Pure; preserves input order.
 */
export function writableGroups(groups: Group[]): Group[] {
  return ownedOrAdminGroups(groups)
}

/**
 * Build the ordered option list for the picker: the viewer ("You")
 * first, then every writable group in input order. The personal option
 * is ALWAYS present and ALWAYS first — the picker defaults to You for
 * every action (never seeded from the active org or a last-used value),
 * so personal is the safe, explicit default.
 *
 * @param viewer the signed-in viewer's own info. `did` is required;
 *   `handle`/`avatarUrl` decorate the "You" row when known.
 */
export function buildPostingOptions(
  viewer: { did: string; handle?: string; avatarUrl?: string },
  groups: Group[],
): PostingIdentity[] {
  const you: PostingIdentity = {
    did: viewer.did,
    kind: "personal",
    label: "You",
    handle: viewer.handle,
    avatarUrl: viewer.avatarUrl,
  }
  const groupOptions: PostingIdentity[] = writableGroups(groups).map((g) => ({
    did: g.groupDid,
    kind: "group",
    label: g.displayName || g.handle,
    handle: g.handle,
    avatarUrl: g.avatarUrl,
    role: g.role,
  }))
  return [you, ...groupOptions]
}

/**
 * Lexicon collections whose writes are HIGH-STAKES — irreversible-feeling,
 * reputation-bearing actions that name a third party. When one of these is
 * authored AS A GROUP, the caller should route through a confirm step
 * (`<PostingAsConfirm>`) that spells out who is endorsing, who operated the
 * action, and the subject, before committing.
 *
 *   - `org.hypercerts.endorsement` — endorsing someone's activity / claim
 *   - `app.certified.badge.award`  — awarding a badge to a subject
 *
 * Membership is matched against an AT-URI's collection segment (see
 * `parseAtUri(uri).collection`). The set is intentionally small and
 * explicit; widening it is a product decision, not an accident.
 */
export const HIGH_STAKES_COLLECTIONS = new Set<string>([
  "org.hypercerts.endorsement",
  "app.certified.badge.award",
])

/**
 * Whether a write to `collection` is high-stakes and therefore warrants
 * the confirm step when authored as a group.
 */
export function isHighStakesCollection(collection: string): boolean {
  return HIGH_STAKES_COLLECTIONS.has(collection)
}
