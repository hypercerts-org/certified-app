/**
 * Dev-only preview fixtures — session.
 *
 * Backs the auth-mock preview harness (`/dev/preview/[surface]`) so the
 * auth-gated composed surfaces (profile, feed, settings, workspace) can
 * be screenshotted logged-out by Playwright. NONE of this ships to a
 * production code path — the only importers are the dev preview page and
 * its `MockFetchProvider`, both gated behind `notFound()` in production.
 *
 * ONE consistent identity is shared across every fixture so the real
 * `useUserProfile` / `useAuth` plumbing resolves `isOwnProfile === true`:
 * the session DID, the resolved profile DID, the workspace actor DID, and
 * the feed-author DIDs all key off {@link MOCK_DID} / {@link MOCK_HANDLE}.
 *
 * The fixtures satisfy the real wire contracts:
 *   - `/api/auth/session`            → `{ did }` (see app/api/auth/session)
 *   - `https://plc.directory/<did>`  → a DID document carrying an
 *                                      `#atproto_pds` service, because
 *                                      `auth-context` resolves the PDS
 *                                      URL via `resolvePdsUrl(did)` which
 *                                      fetches the PLC directory directly.
 *   - `/api/xrpc/com.atproto.server.getSession` → `{ handle, email }`
 */

/** The single identity every preview fixture is keyed to. A real-looking
 *  `did:plc:` value so `isValidDid` and the PLC-directory URL builder in
 *  `lib/atproto/did.ts` accept it. */
export const MOCK_DID = "did:plc:preview000000000000000000000"

/** Handle for {@link MOCK_DID}. Used by the session getSession response
 *  and the resolved-profile / feed-actor fixtures. */
export const MOCK_HANDLE = "ada.certified.app"

/** Email surfaced on the Settings → Email card (own-session getSession). */
export const MOCK_EMAIL = "ada@certified.app"

/** A synthetic PDS endpoint for {@link MOCK_DID}. The harness intercepts
 *  every same-origin `/api/*` call plus the PLC-directory fetch, so this
 *  host is never actually contacted — it only has to look like a valid
 *  https PDS URL so `resolvePdsUrl` returns non-null and downstream code
 *  that builds `${pds}/xrpc/...` URLs produces a well-formed string. */
export const MOCK_PDS_URL = "https://preview-pds.certified.app"

/** Response body for `GET /api/auth/session` — mirrors the real route's
 *  `{ did }` shape (no `transient` flag; the restore "succeeds"). */
export function sessionResponse(): { did: string } {
  return { did: MOCK_DID }
}

/** Response body for `com.atproto.server.getSession` (proxied through
 *  `/api/xrpc/...`). `useSession` reads `handle` + `email` off this. */
export function getSessionResponse(): {
  did: string
  handle: string
  email: string
  emailConfirmed: boolean
  active: boolean
} {
  return {
    did: MOCK_DID,
    handle: MOCK_HANDLE,
    email: MOCK_EMAIL,
    emailConfirmed: true,
    active: true,
  }
}

/**
 * A minimal PLC DID document for {@link MOCK_DID}. Returned by the
 * harness for the `https://plc.directory/<did>` fetch that
 * `resolvePdsUrl` / `resolveHandle` make directly (these bypass our
 * `/api/*` routes, so the mock provider matches the PLC host too).
 *
 * Carries:
 *   - `alsoKnownAs: [at://<handle>]` so `resolveHandle` yields MOCK_HANDLE.
 *   - an `#atproto_pds` service so `resolvePdsUrl` yields MOCK_PDS_URL.
 */
export function plcDidDocument(): {
  id: string
  alsoKnownAs: string[]
  service: { id: string; type: string; serviceEndpoint: string }[]
} {
  return {
    id: MOCK_DID,
    alsoKnownAs: [`at://${MOCK_HANDLE}`],
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: MOCK_PDS_URL,
      },
    ],
  }
}
