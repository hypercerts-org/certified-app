import { Agent } from "@atproto/api"
import type { LexiconDoc } from "@atproto/lexicon"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
import { getServiceAuthToken as mintServiceAuthToken } from "@/lib/atproto/service-auth"
import { logSafe } from "@/lib/utils/log-safe"
import { GROUP_SERVICE_DID } from "./constants"

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
