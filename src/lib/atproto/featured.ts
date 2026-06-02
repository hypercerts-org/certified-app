/**
 * Featured curated collections shown at the top of the /explore
 * sidebar, above the generic filter list.
 *
 * Each entry is a hand-picked group of `org.hypercerts.collection`
 * records owned by a curator account (today only Ma Earth). When the
 * viewer activates the featured filter, the explore loader fetches
 * every listed collection, unions its `items[]`, and surfaces the
 * referenced records as the page's result set:
 *
 *   - accounts collections — items point at
 *     `app.certified.actor.profile/self`; we extract the DID and
 *     render the actor card from `useAuthorInfo`.
 *   - certs collections — items point at
 *     `org.hypercerts.claim.activity`; resolved via
 *     `fetchActivitiesByUris`.
 *   - projects collections — items point at
 *     `org.hypercerts.collection` (sub-type "project"); resolved
 *     via `fetchProjectsByUris`.
 */
/** Filter key used in `?filter=` when Ma Earth is active. */
export const MA_EARTH_FILTER = "ma-earth"

/** Kinds the featured collections are partitioned by — matches the
 *  /explore page's kind set. Inlined here so this lib module doesn't
 *  reach back into a component-level type. */
type FeaturedKind = "accounts" | "projects" | "certs"

/** Source collections for each kind. */
export const MA_EARTH_COLLECTIONS: Record<FeaturedKind, readonly string[]> = {
  accounts: [
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrvar2ofs24",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrtqoixzv2z",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrt4snnh72t",
  ],
  certs: [
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrvaih43w2j",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrtsu7thf2j",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrr5xafi42z",
  ],
  projects: [
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrtyyadrc2s",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrtpxcmfs2z",
    "at://did:plc:s4puetfspot742ai7y4otuel/org.hypercerts.collection/3mmrravn7kl2s",
  ],
}
