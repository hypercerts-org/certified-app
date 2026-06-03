/**
 * Dev-only preview fixtures — actor search.
 *
 * Backs `GET /api/search-actors?q=…` (the typeahead used by the navbar
 * search / explore). The real route returns
 * `{ actors: [{ did, handle, displayName, avatar }] }`; we filter the
 * shared actor directory by the query so the preview typeahead returns
 * something plausible without hitting the public Bluesky AppView.
 */

import { MOCK_ACTORS } from "./authors"

export function searchActorsResponse(query: string): {
  actors: { did: string; handle: string; displayName: string; avatar: string | null }[]
} {
  const q = query.trim().toLowerCase()
  const matches = q
    ? MOCK_ACTORS.filter(
        (a) =>
          a.handle.toLowerCase().includes(q) ||
          a.displayName.toLowerCase().includes(q),
      )
    : MOCK_ACTORS
  return {
    actors: matches.map((a) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName,
      avatar: null,
    })),
  }
}
