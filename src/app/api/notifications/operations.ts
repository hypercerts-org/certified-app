import { isValidDid } from "@/lib/utils/did"

/**
 * Notifications GraphQL operations + variable normalization, factored out
 * of route.ts so the flag-gate + recipients validation is unit-testable
 * without standing up the full Next route (session, OAuth, service-auth).
 *
 * The aggregation flag is INJECTED (not read from the module) so a test can
 * exercise both states deterministically; route.ts passes
 * NOTIFICATIONS_AGGREGATION_ENABLED. See
 * docs/org-identity/indexer-notifications-aggregation.md.
 */

export const MAX_FIRST = 100
// Cap the aggregated recipient set. A user owns/admins few groups in
// practice; this bounds the indexer query and rejects pathological input.
export const MAX_RECIPIENTS = 25

/** Allowlist of GraphQL operations we forward. The client sends only
 *  operationName + variables; the query string is held server-side. These
 *  base queries take no recipient arg — the indexer derives the acting DID
 *  from the JWT `iss`. */
export const OPERATIONS: Record<string, string> = {
  notifications: `
    query notifications($first: Int!, $after: String) {
      notifications(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            reason
            reasonSubject
            sortAt
            count
            latestRecordUri
            latestRecordCid
            latestAuthor
            isRead
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  unreadNotificationCount: `
    query unreadNotificationCount {
      unreadNotificationCount { count more }
    }`,
  updateNotificationsSeen: `
    mutation updateNotificationsSeen($seenAt: String) {
      updateNotificationsSeen(seenAt: $seenAt)
    }`,
}

/**
 * Aggregated query variants — used ONLY when the aggregation flag is on AND
 * the client supplied a non-empty `recipients` set. Held apart from
 * OPERATIONS so the default path's query stays byte-identical: an indexer
 * that doesn't yet understand `recipients` never receives the argument. The
 * node also selects the new `recipient` field so the client can tag each
 * row "via {group}".
 */
export const AGGREGATED_OPERATIONS: Record<string, string> = {
  notifications: `
    query notifications($first: Int!, $after: String, $recipients: [String!]) {
      notifications(first: $first, after: $after, recipients: $recipients) {
        edges {
          cursor
          node {
            id
            reason
            reasonSubject
            sortAt
            count
            latestRecordUri
            latestRecordCid
            latestAuthor
            isRead
            recipient
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  unreadNotificationCount: `
    query unreadNotificationCount($recipients: [String!]) {
      unreadNotificationCount(recipients: $recipients) { count more }
    }`,
}

export type ClientVariables = {
  first?: unknown
  after?: unknown
  seenAt?: unknown
  recipients?: unknown
}

/**
 * Validate a client-supplied `recipients` list. Returns null (the arg is
 * dropped) when aggregation is off, the input is malformed, or nothing
 * survives — so the default path never sends `recipients`. The indexer
 * re-authorizes every DID against its own role index; this is shape + bound
 * validation only (valid DIDs, deduped, capped).
 */
export function parseRecipients(
  raw: unknown,
  aggregationEnabled: boolean,
): string[] | null {
  if (!aggregationEnabled) return null
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== "string") continue
    if (v.length > 256 || !isValidDid(v)) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= MAX_RECIPIENTS) break
  }
  return out.length > 0 ? out : null
}

/** Normalize client-supplied variables per-operation. Returns null for an
 *  unknown operation. */
export function buildVariables(
  operationName: string,
  vars: ClientVariables,
  aggregationEnabled: boolean,
): Record<string, unknown> | null {
  switch (operationName) {
    case "notifications": {
      const first =
        typeof vars.first === "number" && Number.isFinite(vars.first)
          ? Math.min(Math.max(1, Math.floor(vars.first)), MAX_FIRST)
          : 50
      const after =
        typeof vars.after === "string" &&
        vars.after.length > 0 &&
        vars.after.length <= 512
          ? vars.after
          : null
      const recipients = parseRecipients(vars.recipients, aggregationEnabled)
      return recipients ? { first, after, recipients } : { first, after }
    }
    case "unreadNotificationCount": {
      const recipients = parseRecipients(vars.recipients, aggregationEnabled)
      return recipients ? { recipients } : {}
    }
    case "updateNotificationsSeen": {
      let seenAt: string = new Date().toISOString()
      if (
        typeof vars.seenAt === "string" &&
        Number.isFinite(Date.parse(vars.seenAt))
      ) {
        seenAt = vars.seenAt
      }
      return { seenAt }
    }
    default:
      return null
  }
}

/** Pick the query string for an operation. The aggregated variant is chosen
 *  ONLY when `buildVariables` produced a `recipients` arg — so the default
 *  query goes out unchanged whenever the flag is off or recipients are
 *  absent. */
export function selectQuery(
  operationName: string,
  variables: Record<string, unknown>,
): string | undefined {
  if ("recipients" in variables && AGGREGATED_OPERATIONS[operationName]) {
    return AGGREGATED_OPERATIONS[operationName]
  }
  return OPERATIONS[operationName]
}
