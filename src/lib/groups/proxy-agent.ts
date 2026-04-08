import { Agent } from "@atproto/api"
import type { LexiconDoc } from "@atproto/lexicon"
import { getOAuthClient } from "@/lib/auth/oauth-client"
import { getSessionDid, deleteSession } from "@/lib/auth/session"
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
  } catch {
    await deleteSession()
    return null
  }

  return { agent: new Agent(oauthSession), did }
}

/**
 * Create a proxy agent that routes requests through the user's PDS
 * to the group service for a specific group.
 */
export function createGroupAgent(agent: Agent, groupDid: string): Agent {
  const proxied = agent.withProxy("certified_group", groupDid) as Agent
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
  const { data } = await agent.com.atproto.server.getServiceAuth({
    aud: GROUP_SERVICE_DID,
    lxm,
  })
  return data.token
}
