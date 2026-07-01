/**
 * Dev-only preview fixtures — profile.
 *
 * Satisfies the contracts the profile surface fans out to:
 *   - `GET  /api/resolve-did?did=…|handle=…`  → {@link ResolvedProfilePayload}
 *     (see app/api/resolve-did/resolve-core.ts). `useUserProfile` reads
 *     this; the DID equals {@link MOCK_DID} so `isOwnProfile === true`.
 *   - `POST /api/resolve-dids`                → `{ results: { [input]: payload } }`
 *     (batched byline / contributor resolution).
 *   - `com.atproto.repo.getRecord` for `app.certified.actor.profile`
 *     (rkey `self`) → `{ uri, cid, value }` — the RAW certs record the
 *     own-profile inline-edit base (`getProfileWithCid`) reads.
 *   - `com.atproto.repo.getRecord` for `app.certified.actor.organization`
 *     (the ORG-MARKER variant) → 404-style miss for the individual
 *     `profile` scenario, present for `profile-org`.
 *
 * The scenario flag flips the resolved identity between an individual and
 * an organization so `/dev/preview/profile` and `/dev/preview/profile-org`
 * exercise both sidebar modes.
 */

import type { ResolvedProfilePayload } from "@/app/api/resolve-did/resolve-core"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type { GroupMetadata } from "@/lib/groups/types"
import {
  MOCK_DID,
  MOCK_HANDLE,
} from "./session"

/** A second consistent org identity. Same `did:plc:` shape as MOCK_DID.
 *  NOTE: the `profile-org` PREVIEW no longer resolves to this DID — it
 *  renders the org as the viewer's OWN identity (MOCK_DID + an org marker)
 *  so `isOwnProfile`/`canEditInline` hold. These constants remain for any
 *  byline/contributor fixture that wants a distinct foreign org actor and
 *  are re-exported by the mock-fetch provider. */
export const MOCK_ORG_DID = "did:plc:previeworg0000000000000000000"
export const MOCK_ORG_HANDLE = "earthfund.certified.app"

export type ProfileScenario = "individual" | "org"

const INDIVIDUAL_DISPLAY_NAME = "Ada Pollen"
const INDIVIDUAL_DESCRIPTION =
  "Restoration ecologist. Building soil-carbon measurement tooling and verifying drawdown claims in the open."

const ORG_DISPLAY_NAME = "Earth Fund"
const ORG_DESCRIPTION =
  "A pooled-funding collective backing measurable ecological-restoration work. We endorse the people and projects we have verified."

/** Resolved-profile payload for `/api/resolve-did` and the per-identity
 *  entries of `/api/resolve-dids`. `hasCertifiedProfile: true` so the
 *  own-profile view does NOT suppress the values as a bsky fallback.
 *
 *  Both scenarios resolve to the SESSION identity ({@link MOCK_DID} /
 *  {@link MOCK_HANDLE}) — only the display content (and, for `org`, the
 *  org marker fetched separately) differs. Keying the org preview to the
 *  viewer's own DID is what makes `isOwnProfile === true` (and therefore
 *  `canEditInline === true`, so the owner-only inline-edit + response
 *  affordances render). The dedicated MOCK_ORG_* identity is retained for
 *  byline/contributor fixtures but is intentionally NOT the viewed DID:
 *  a distinct org DID would make `isOwnProfile` false and, with no group
 *  membership in the fixtures, leave the org preview read-only. */
export function resolvedProfile(
  scenario: ProfileScenario = "individual",
): ResolvedProfilePayload {
  const isOrg = scenario === "org"
  return {
    did: MOCK_DID,
    handle: MOCK_HANDLE,
    displayName: isOrg ? ORG_DISPLAY_NAME : INDIVIDUAL_DISPLAY_NAME,
    description: isOrg ? ORG_DESCRIPTION : INDIVIDUAL_DESCRIPTION,
    pronouns: isOrg ? undefined : "she/her",
    website: isOrg ? "https://earthfund.example" : "https://ada.example",
    avatar: null,
    banner: null,
    createdAt: "2024-01-15T09:30:00.000Z",
    hasCertifiedProfile: true,
    hasBlueskyProfile: false,
    blueskyProfile: null,
  }
}

/** The RAW `app.certified.actor.profile` record `getProfileWithCid`
 *  reads for the inline-edit base. Carries no blob refs (avatar/banner
 *  cleared) so a text-only save wouldn't delete anything — fine for a
 *  read-only preview. */
export function certsProfileRecord(scenario: ProfileScenario = "individual"): {
  uri: string
  cid: string
  value: CertifiedProfile
} {
  const isOrg = scenario === "org"
  // Keyed to the session DID for both scenarios — the inline-edit base
  // (`getProfileWithCid`) fetches getRecord(repo=did) where `did` is the
  // resolved (own) DID, which is now MOCK_DID in both cases.
  const did = MOCK_DID
  const value: CertifiedProfile = {
    $type: "app.certified.actor.profile",
    displayName: isOrg ? ORG_DISPLAY_NAME : INDIVIDUAL_DISPLAY_NAME,
    description: isOrg ? ORG_DESCRIPTION : INDIVIDUAL_DESCRIPTION,
    pronouns: isOrg ? undefined : "she/her",
    website: isOrg ? "https://earthfund.example" : "https://ada.example",
    createdAt: "2024-01-15T09:30:00.000Z",
  }
  return {
    uri: `at://${did}/app.certified.actor.profile/self`,
    cid: "bafyreigh2akiscaildc000000000000000000000000000000000000000",
    value,
  }
}

/** The `app.certified.actor.organization` marker record — present only
 *  for the org scenario. `useOrgMarker` reads `value` (and its `urls`)
 *  off the getRecord `{ value }`. */
export function orgMarkerRecord(): {
  uri: string
  cid: string
  value: GroupMetadata
} {
  const value: GroupMetadata = {
    $type: "app.certified.actor.organization",
    organizationType: "Foundation",
    urls: [
      { url: "https://earthfund.example", label: "Website" },
      { url: "https://bsky.app/profile/earthfund.certified.app", label: "Bluesky" },
    ],
    location: { name: "Lisbon, Portugal", lat: 38.7223, lng: -9.1393 },
    foundedDate: "2022-03-01",
    longDescription:
      "Earth Fund pools philanthropic capital and routes it to ecological-restoration teams whose impact we have independently measured and endorsed.",
    createdAt: "2022-03-01T00:00:00.000Z",
  }
  return {
    // Marker lives on the viewed (session) DID so `useOrgMarker(did)`
    // resolves it for the own-profile org preview.
    uri: `at://${MOCK_DID}/app.certified.actor.organization/self`,
    cid: "bafyreiorgmarker00000000000000000000000000000000000000000000",
    value,
  }
}
