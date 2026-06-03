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

/** Org identity variant — a second consistent identity used by the
 *  `profile-org` surface. Same `did:plc:` shape as MOCK_DID. */
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
 *  own-profile view does NOT suppress the values as a bsky fallback. */
export function resolvedProfile(
  scenario: ProfileScenario = "individual",
): ResolvedProfilePayload {
  const isOrg = scenario === "org"
  return {
    did: isOrg ? MOCK_ORG_DID : MOCK_DID,
    handle: isOrg ? MOCK_ORG_HANDLE : MOCK_HANDLE,
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
  const did = isOrg ? MOCK_ORG_DID : MOCK_DID
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
    uri: `at://${MOCK_ORG_DID}/app.certified.actor.organization/self`,
    cid: "bafyreiorgmarker00000000000000000000000000000000000000000000",
    value,
  }
}
