"use client"

/**
 * Dev-only auth-mock fetch provider.
 *
 * Patches `window.fetch` BEFORE its children mount so the real provider
 * stack (`AuthProvider` → `OrgProvider` → …) and the real composed
 * surfaces resolve against fixture data instead of the live backend.
 * This lets Playwright screenshot the auth-gated surfaces (profile,
 * feed, settings, workspace) logged-out, byte-identically to production.
 *
 * Routing:
 *   - `/api/auth/session`              → fixture session `{ did }`
 *   - `/api/indexer` (POST)            → dispatched by `operationName`
 *   - `/api/resolve-did`  (GET)        → single resolved profile
 *   - `/api/resolve-dids` (POST)       → batched resolved profiles
 *   - `/api/xrpc/...`                  → getSession / getRecord / listRecords
 *                                        (incl. the org-marker getRecord variant)
 *   - `/api/search-actors`             → filtered actor directory
 *   - `/api/groups/memberships`        → empty (personal identity stays active)
 *   - `https://plc.directory/<did>`    → fixture DID document (resolvePdsUrl)
 *   - everything else                  → passthrough to the real fetch
 *
 * NOT shipped to production: the only mount site is the dev preview page,
 * which `notFound()`s in production. The patch is installed once (guarded
 * by a module flag against React StrictMode double-invocation) and
 * removed on unmount.
 */

import { useState, useEffect } from "react"
import {
  sessionResponse,
  getSessionResponse,
  plcDidDocument,
  MOCK_DID,
} from "@/lib/dev/fixtures/session"
import {
  resolvedProfile,
  certsProfileRecord,
  orgMarkerRecord,
  MOCK_ORG_DID,
  type ProfileScenario,
} from "@/lib/dev/fixtures/profile"
import { resolveDidsResults } from "@/lib/dev/fixtures/authors"
import {
  followerEventsConnection,
  hydrateFeedPageData,
  activitiesConnection,
} from "@/lib/dev/fixtures/feed"
import {
  networkActorsConnection,
  actorWorkspaceCounts,
  followersConnection,
  receivedEndorsementsConnection,
  userProjectsConnection,
  evaluatorEndorsementsConnection,
  followRecords,
  groupsMembershipsResponse,
} from "@/lib/dev/fixtures/groups"
import { searchActorsResponse } from "@/lib/dev/fixtures/search"

export type MockScenario = "populated" | "empty"

interface MockFetchProviderProps {
  children: React.ReactNode
  /** Which profile identity to resolve own-profile to. */
  profileScenario?: ProfileScenario
  /** Fixture density. `empty` makes every list/connection empty so
   *  empty-state surfaces can be screenshotted too. */
  scenario?: MockScenario
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** Marker on the patched function so we never double-wrap (StrictMode). */
const PATCHED = Symbol.for("certified.dev.mockFetch")

type IndexerBody = { operationName?: string; variables?: Record<string, unknown> }

/** Dispatch an `/api/indexer` POST by GraphQL `operationName`. Returns a
 *  GraphQL-shaped `{ data }` envelope matching the upstream the proxy
 *  forwards verbatim. Unknown ops return `{ data: {} }` (the client
 *  fetchers treat a missing root field as an empty result). */
function indexerResponse(
  body: IndexerBody,
  opts: { empty: boolean },
): Response {
  const op = body.operationName
  const vars = body.variables ?? {}
  const did = typeof vars.did === "string" ? vars.did : MOCK_DID

  const emptyConn = {
    totalCount: 0,
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  }

  switch (op) {
    case "FollowerEvents":
      return json({
        data: {
          followerEvents: opts.empty
            ? { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
            : followerEventsConnection(),
        },
      })
    case "HydrateFeedPage":
      return json({
        data: opts.empty
          ? {
              activities: { edges: [] },
              collections: { edges: [] },
              badgeAwards: { edges: [] },
              evaluations: { edges: [] },
              measurements: { edges: [] },
              hyperboards: { edges: [] },
              attachments: { edges: [] },
            }
          : hydrateFeedPageData(),
      })
    case "EvaluatorEndorsements":
      return json({
        data: { appCertifiedBadgeAward: evaluatorEndorsementsConnection() },
      })
    case "NetworkActors":
    case "NetworkActorsByKind":
    case "NetworkActorsByDids":
      return json({
        data: {
          appCertifiedActorProfile: opts.empty
            ? emptyConn
            : networkActorsConnection(),
        },
      })
    case "ActorWorkspaceCounts":
      return json({
        data: opts.empty
          ? {
              certs: { totalCount: 0 },
              projects: { totalCount: 0 },
              lists: { totalCount: 0 },
              endorsementsReceived: { totalCount: 0 },
              followers: { totalCount: 0 },
            }
          : actorWorkspaceCounts(did),
      })
    case "Followers":
      return json({
        data: {
          appCertifiedGraphFollow: opts.empty
            ? emptyConn
            : followersConnection(did),
        },
      })
    case "ReceivedEndorsements":
      return json({
        data: {
          appCertifiedBadgeAward: opts.empty
            ? { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
            : receivedEndorsementsConnection(did),
        },
      })
    case "UserProjects":
    case "Projects":
      return json({
        data: {
          orgHypercertsCollection: opts.empty
            ? emptyConn
            : userProjectsConnection(did),
        },
      })
    case "Activities":
    case "AuthoredActivities":
    case "ContributedActivities":
      return json({
        data: {
          orgHypercertsClaimActivity: opts.empty
            ? emptyConn
            : activitiesConnection(),
        },
      })
    case "ProfileCount":
    case "OrganizationCount":
    case "ActivityCount":
    case "ProjectCount":
    case "AwardCount": {
      // Welcome-strip counts — single aggregate connections.
      const root =
        op === "ProfileCount"
          ? "appCertifiedActorProfile"
          : op === "OrganizationCount"
            ? "appCertifiedActorOrganization"
            : op === "ActivityCount"
              ? "orgHypercertsClaimActivity"
              : op === "ProjectCount"
                ? "orgHypercertsCollection"
                : "appCertifiedBadgeAward"
      return json({
        data: {
          [root]: {
            totalCount: opts.empty ? 0 : 128,
            edges: [],
            pageInfo: { hasNextPage: false },
          },
        },
      })
    }
    default:
      // Unknown / unused op — return an empty GraphQL envelope. The
      // client fetchers all guard on a missing root field and degrade
      // to an empty result rather than throwing.
      return json({ data: {} })
  }
}

/** Handle an `/api/xrpc/...` request. Path segments after `/api/xrpc/`
 *  join into the method name; query params carry repo/collection/rkey. */
function xrpcResponse(
  url: URL,
  scenario: ProfileScenario,
  empty: boolean,
): Response {
  const method = url.pathname.replace(/^\/api\/xrpc\//, "").replace(/\//g, ".")
  const params = url.searchParams
  const collection = params.get("collection") ?? ""

  if (method === "com.atproto.server.getSession") {
    return json(getSessionResponse())
  }

  if (method === "com.atproto.repo.getRecord") {
    if (collection === "app.certified.actor.profile") {
      return json(certsProfileRecord(scenario))
    }
    if (collection === "app.certified.actor.organization") {
      // ORG-MARKER variant: present for the org scenario, a
      // RecordNotFound-shaped 400 otherwise (matches the real proxy,
      // which surfaces the agent error as 400 `{ error: "RecordNotFound" }`).
      if (scenario === "org") return json(orgMarkerRecord())
      return json({ error: "RecordNotFound" }, 400)
    }
    // Any other single record (bsky profile, etc.) — treat as missing.
    return json({ error: "RecordNotFound" }, 400)
  }

  if (method === "com.atproto.repo.listRecords") {
    if (collection === "app.certified.graph.follow") {
      return json(empty ? { records: [] } : followRecords())
    }
    // Memberships, activities-by-PDS, and anything else → empty list.
    return json({ records: [] })
  }

  // getBlob and any other XRPC read — empty 404; avatars fall back to
  // initials in the preview.
  return json({ error: "NotFound" }, 404)
}

function installMockFetch(
  profileScenario: ProfileScenario,
  scenario: MockScenario,
): () => void {
  if (typeof window === "undefined") return () => {}
  const realFetch = window.fetch
  // Already patched (StrictMode re-mount or nested provider) — no-op.
  if ((realFetch as unknown as Record<symbol, unknown>)[PATCHED]) {
    return () => {}
  }

  const empty = scenario === "empty"

  const mockFetch: typeof window.fetch = async (input, init) => {
    let url: URL
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      url = new URL(raw, window.location.origin)
    } catch {
      return realFetch(input as RequestInfo, init)
    }

    const path = url.pathname

    // --- PLC directory (resolvePdsUrl / resolveHandle fetch it directly) ---
    if (url.hostname === "plc.directory") {
      return json(plcDidDocument())
    }

    // --- public Bluesky AppView (the home "Our news" rail fetches it
    //     directly, bypassing our /api/* routes). Return an empty feed so
    //     the preview stays fully offline and deterministic. ---
    if (url.hostname === "public.api.bsky.app") {
      if (path.includes("getAuthorFeed")) return json({ feed: [] })
      if (path.includes("getProfile")) {
        return json({ did: MOCK_DID, handle: "preview", displayName: "Preview" })
      }
      if (path.includes("searchActors")) return json({ actors: [] })
      if (path.includes("resolveHandle")) return json({ did: MOCK_DID })
      return json({})
    }

    // --- same-origin API routes ---
    if (url.origin === window.location.origin) {
      if (path === "/api/auth/session") {
        return json(sessionResponse())
      }
      if (path === "/api/auth/logout" || path === "/api/auth/login") {
        return json({ ok: true })
      }
      if (path === "/api/indexer") {
        let parsed: IndexerBody = {}
        try {
          const text =
            typeof init?.body === "string"
              ? init.body
              : init?.body
                ? String(init.body)
                : "{}"
          parsed = JSON.parse(text) as IndexerBody
        } catch {
          /* fall through with empty body → default op */
        }
        return indexerResponse(parsed, { empty })
      }
      if (path === "/api/resolve-did") {
        // Single resolve — the viewer's own profile (or org variant).
        return json(resolvedProfile(profileScenario))
      }
      if (path === "/api/resolve-dids") {
        let identities: string[] = []
        try {
          const text =
            typeof init?.body === "string" ? init.body : String(init?.body)
          const b = JSON.parse(text) as { identities?: unknown }
          identities = Array.isArray(b.identities)
            ? b.identities.filter((v): v is string => typeof v === "string")
            : []
        } catch {
          /* empty */
        }
        return json({ results: resolveDidsResults(identities) })
      }
      if (path.startsWith("/api/xrpc/")) {
        return xrpcResponse(url, profileScenario, empty)
      }
      if (path === "/api/search-actors") {
        return json(searchActorsResponse(url.searchParams.get("q") ?? ""))
      }
      if (path === "/api/groups/memberships") {
        return json(groupsMembershipsResponse())
      }
      if (path === "/api/notifications") {
        // The notifications client (`lib/atproto/notifications.ts`) POSTs
        // a GraphQL-shaped `{ operationName, variables }` and dispatches
        // the response by op. `unreadNotificationCount` in particular
        // throws "Unread count unavailable" if the field is missing, so
        // every op the provider polls needs a valid envelope here.
        let op: string | undefined
        try {
          const text =
            typeof init?.body === "string"
              ? init.body
              : init?.body
                ? String(init.body)
                : "{}"
          op = (JSON.parse(text) as { operationName?: string }).operationName
        } catch {
          /* fall through → default empty notifications page */
        }
        if (op === "unreadNotificationCount") {
          return json({
            data: { unreadNotificationCount: { count: 0, more: false } },
          })
        }
        if (op === "updateNotificationsSeen") {
          return json({ data: { updateNotificationsSeen: { seenAt: null } } })
        }
        // `notifications` (list) and anything else → empty, valid page.
        return json({
          data: {
            notifications: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })
      }
    }

    // Everything else (fonts, _next assets, analytics, etc.) → real fetch.
    return realFetch(input as RequestInfo, init)
  }

  ;(mockFetch as unknown as Record<symbol, unknown>)[PATCHED] = true
  window.fetch = mockFetch

  return () => {
    // Only restore if we're still the installed patch.
    if (window.fetch === mockFetch) window.fetch = realFetch
  }
}

export default function MockFetchProvider({
  children,
  profileScenario = "individual",
  scenario = "populated",
}: MockFetchProviderProps) {
  // Install synchronously during the FIRST render (via the useState lazy
  // initializer) so the patch is in place before any child provider's
  // effect fires its first fetch. The initializer returns the teardown
  // fn, which is held in state and called on unmount. Storing it in
  // state (not a ref) keeps render side-effect-free per react-hooks/refs.
  const [teardown] = useState<() => void>(() =>
    installMockFetch(profileScenario, scenario),
  )

  useEffect(() => {
    return () => {
      teardown()
    }
  }, [teardown])

  return <>{children}</>
}

export { MOCK_DID, MOCK_ORG_DID }
