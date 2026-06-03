/**
 * Dev-only preview fixtures — authors / actors.
 *
 * A small directory of synthetic actors that the feed, workspace, and
 * byline-resolution paths share. Keeping them in one place means a feed
 * event authored by `did:plc:author1…` resolves to the same name/avatar
 * everywhere it appears (feed actor block, `/api/resolve-dids` byline,
 * workspace actor switcher).
 *
 * The {@link MOCK_DID} viewer is intentionally the FIRST author so the
 * feed's follow-union includes the viewer's own activity, and so the
 * workspace actor list opens on the viewer.
 */

import type { ResolvedProfilePayload } from "@/app/api/resolve-did/resolve-core"
import { MOCK_DID, MOCK_HANDLE } from "./session"

export interface MockActor {
  did: string
  handle: string
  displayName: string
  description: string
  /** Bare CID — feed/workspace nodes carry this and the client builds
   *  a `/api/xrpc/com/atproto/sync/getBlob` URL from it. `null` renders
   *  an initials avatar (no extra blob fetch needed in the preview). */
  avatarCid: string | null
  /** ISO join date surfaced on workspace actor rows. */
  createdAt: string
}

/** Ordered actor directory. Index 0 is the signed-in viewer. */
export const MOCK_ACTORS: MockActor[] = [
  {
    did: MOCK_DID,
    handle: MOCK_HANDLE,
    displayName: "Ada Pollen",
    description:
      "Restoration ecologist. Building soil-carbon measurement tooling.",
    avatarCid: null,
    createdAt: "2024-01-15T09:30:00.000Z",
  },
  {
    did: "did:plc:author10000000000000000000000",
    handle: "mangrove.certified.app",
    displayName: "Mangrove Collective",
    description: "Coastal reforestation, 12 sites across three estuaries.",
    avatarCid: null,
    createdAt: "2024-02-02T12:00:00.000Z",
  },
  {
    did: "did:plc:author20000000000000000000000",
    handle: "rosa.certified.app",
    displayName: "Rosa Linden",
    description: "Independent evaluator. I verify drawdown claims.",
    avatarCid: null,
    createdAt: "2024-03-19T08:10:00.000Z",
  },
  {
    did: "did:plc:author30000000000000000000000",
    handle: "kelp.certified.app",
    displayName: "Kelp Forest Trust",
    description: "Restoring kelp canopy along temperate coastlines.",
    avatarCid: null,
    createdAt: "2024-04-07T16:45:00.000Z",
  },
  {
    did: "did:plc:author40000000000000000000000",
    handle: "soil.certified.app",
    displayName: "Soil Carbon Lab",
    description: "Open measurement protocols for regenerative agriculture.",
    avatarCid: null,
    createdAt: "2024-05-11T11:20:00.000Z",
  },
]

/** Lookup by DID. */
export function actorByDid(did: string): MockActor | undefined {
  return MOCK_ACTORS.find((a) => a.did === did)
}

/** Build a {@link ResolvedProfilePayload} for one actor — the shape
 *  `/api/resolve-dids` returns per identity. */
export function actorToResolvedProfile(actor: MockActor): ResolvedProfilePayload {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    description: actor.description,
    avatar: null,
    banner: null,
    createdAt: actor.createdAt,
    hasCertifiedProfile: true,
    hasBlueskyProfile: false,
    blueskyProfile: null,
  }
}

/**
 * Resolve a batch of inputs (DIDs or handles) to the `{ [input]: payload }`
 * map `/api/resolve-dids` returns. Unknown inputs map to a generic
 * placeholder payload keyed to the input itself (a valid-looking DID) so
 * the byline still renders rather than going null.
 */
export function resolveDidsResults(
  identities: string[],
): Record<string, ResolvedProfilePayload | null> {
  const out: Record<string, ResolvedProfilePayload | null> = {}
  for (const input of identities) {
    const actor =
      MOCK_ACTORS.find((a) => a.did === input || a.handle === input) ?? null
    if (actor) {
      out[input] = actorToResolvedProfile(actor)
      continue
    }
    // Fall back to a minimal payload so contributor / author rows for
    // unknown identities still render a handle instead of a broken row.
    out[input] = {
      did: input.startsWith("did:") ? input : MOCK_DID,
      handle: input.startsWith("did:") ? input.slice(0, 24) : input,
      avatar: null,
      banner: null,
      hasCertifiedProfile: false,
      hasBlueskyProfile: false,
      blueskyProfile: null,
    }
  }
  return out
}
