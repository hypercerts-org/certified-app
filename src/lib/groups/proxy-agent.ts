import { Agent } from "@atproto/api"
import type { LexiconDoc } from "@atproto/lexicon"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { getServiceAuthToken as mintServiceAuthToken } from "@/lib/atproto/service-auth"
import { logSafe } from "@/lib/utils/log-safe"
import { GROUP_SERVICE, GROUP_SERVICE_DID } from "./constants"

/**
 * Custom lexicon definitions for the group service.
 * These must be registered so the AtpAgent recognizes
 * `app.certified.group.repo.*` NSIDs for service proxying.
 */
const GROUP_LEXICONS: LexiconDoc[] = [
  {
    lexicon: 1,
    id: "app.certified.group.register",
    defs: {
      main: {
        type: "procedure",
        description: "Register a new group account.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.repo.createRecord",
    defs: {
      main: {
        type: "procedure",
        description: "Create a record in a group repo.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.repo.putRecord",
    defs: {
      main: {
        type: "procedure",
        description: "Put a record in a group repo.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.repo.deleteRecord",
    defs: {
      main: {
        type: "procedure",
        description: "Delete a record from a group repo.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.repo.uploadBlob",
    defs: {
      main: {
        type: "procedure",
        description: "Upload a blob to a group repo.",
        input: { encoding: "*/*", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.member.add",
    defs: {
      main: {
        type: "procedure",
        description: "Add a member to a group.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.member.remove",
    defs: {
      main: {
        type: "procedure",
        description: "Remove a member from a group.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.member.list",
    defs: {
      main: {
        type: "query",
        description: "List members of a group.",
        parameters: {
          type: "params",
          properties: {
            limit: { type: "integer" },
            cursor: { type: "string" },
          },
        },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.role.set",
    defs: {
      main: {
        type: "procedure",
        description: "Set a member's role.",
        input: { encoding: "application/json", schema: { type: "object", properties: {} } },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
  {
    lexicon: 1,
    id: "app.certified.group.audit.query",
    defs: {
      main: {
        type: "query",
        description: "Query the audit log.",
        parameters: {
          type: "params",
          properties: {
            actorDid: { type: "string" },
            action: { type: "string" },
            collection: { type: "string" },
            limit: { type: "integer" },
            cursor: { type: "string" },
          },
        },
        output: { encoding: "application/json", schema: { type: "object", properties: {} } },
      },
    },
  },
]

/**
 * Get an authenticated agent for the current user's PDS session.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedAgent(): Promise<{
  agent: Agent
  did: string
} | null> {
  const did = await getSessionDid()
  if (!did) return null

  const client = await getOAuthClient()
  let oauthSession
  try {
    oauthSession = await client.restore(did)
  } catch (err) {
    // Mirrors the XRPC proxy's pattern at
    // `src/app/api/xrpc/[...method]/route.ts:152` — without this log,
    // every BFF route's session-expiry event is invisible in Vercel
    // logs and operator can't tell user-reported "I got signed out"
    // events from real auth failures.
    logSafe("[proxy-agent] oauth restore failed", err)
    await deleteSession()
    return null
  }

  return { agent: new Agent(oauthSession), did }
}

/**
 * Create a proxy agent that routes requests through the user's PDS to
 * the group service.
 *
 * Targeting (CGS #27 migration, see `docs/aud-migration.md` in the
 * certified-group-service repo):
 *
 *   - **Default (new form):** proxy to the *service* DID via the
 *     `certified_group_service` service id. The user's PDS resolves the
 *     service's `/.well-known/did.json`, mints `aud` = the service DID,
 *     and forwards. The target group is then named by an explicit
 *     `repo` field on each call — in the body for JSON-body procedures
 *     (`repo.*`, `member.add/remove`, `role.set`), on the querystring
 *     for queries (`member.list`, `audit.query`) and body-less methods
 *     (`repo.uploadBlob`). Callers MUST include `repo` or CGS can't
 *     resolve the group.
 *   - **Legacy form (`opts.legacy`):** proxy to the *group* DID via the
 *     `certified_group` service id, so `aud` = the group DID and the
 *     group is read from `aud`. Deprecated upstream and slated for
 *     removal; kept only for `com.atproto.identity.updateHandle`, a
 *     stock method with no `repo` field that CGS targets via `aud`.
 */
export function createGroupAgent(
  agent: Agent,
  groupDid: string,
  opts?: { legacy?: boolean },
): Agent {
  const proxied = (
    opts?.legacy
      ? agent.withProxy("certified_group", groupDid)
      : agent.withProxy("certified_group_service", GROUP_SERVICE_DID)
  ) as Agent
  for (const doc of GROUP_LEXICONS) {
    proxied.lex.add(doc)
  }
  return proxied
}

/**
 * Get a service auth JWT for direct calls to the group service.
 * Used only for registration (the only direct call).
 */
export async function getServiceAuthToken(
  agent: Agent,
  lxm: string
): Promise<string> {
  return mintServiceAuthToken(agent, GROUP_SERVICE_DID, lxm)
}

/**
 * Direct (non-proxied) CGS XRPC call authenticated with a service-auth JWT
 * (`aud` = the service DID), bypassing `agent.withProxy(...)`.
 *
 * The proxied form needs the *user's* PDS to resolve the service DID's
 * `#certified_group_service` entry and mint the token itself; the certified.one
 * ePDS can't ("could not resolve proxy did"), so every proxied group call 500s.
 * This direct form is the supported, fully-`repo`-migrated path (CGS skill +
 * aud→repo #27) and mirrors the working /groups/import, /register, /destroy and
 * /activity routes.
 *
 * Per #27: queries put `repo` (+ filters) on the querystring; JSON-body
 * procedures put `repo` in the body. Returns the raw Response so the caller can
 * map status and forward the typed atproto error `code` where it matters.
 */
export async function groupServiceFetch(
  agent: Agent,
  nsid: string,
  opts: {
    query?: Record<string, string | number | undefined | null>
    body?: unknown
    encoding?: string
  } = {}
): Promise<Response> {
  const token = await getServiceAuthToken(agent, nsid)
  let url = `${GROUP_SERVICE}/xrpc/${nsid}`
  if (opts.query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  const hasBody = opts.body !== undefined
  const encoding = opts.encoding ?? "application/json"
  return fetch(url, {
    method: hasBody ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": encoding } : {}),
    },
    ...(hasBody
      ? {
          body:
            encoding === "application/json"
              ? JSON.stringify(opts.body)
              : (opts.body as BodyInit),
        }
      : {}),
    signal: AbortSignal.timeout(15_000),
  })
}

/**
 * {@link groupServiceFetch} + JSON handling. Returns the parsed response body
 * on 2xx (the same shape `agent.call(...).data` used to yield); on a non-2xx
 * throws an object shaped for {@link extractRouteError} (`{ status, error?,
 * message }`) so a route's `catch` maps the upstream status + atproto error
 * `code` exactly as it did for the old proxied `.call()` (which threw
 * `XRPCError`). Drop-in replacement for `const { data } = await
 * createGroupAgent(agent, repo).call(nsid, ...)`.
 */
export async function callGroupServiceJson(
  agent: Agent,
  nsid: string,
  opts?: {
    query?: Record<string, string | number | undefined | null>
    body?: unknown
    encoding?: string
  }
): Promise<unknown> {
  const res = await groupServiceFetch(agent, nsid, opts)
  if (res.ok) {
    const text = await res.text()
    return text ? JSON.parse(text) : {}
  }
  let code: string | undefined
  let message = `Group service error ${res.status}`
  try {
    const data = (await res.json()) as { error?: string; message?: string }
    if (typeof data.error === "string") code = data.error
    if (typeof data.message === "string") message = data.message
    else if (code) message = code
  } catch {
    // non-JSON error body — keep the generic message
  }
  throw Object.assign(new Error(message), { status: res.status, error: code })
}
