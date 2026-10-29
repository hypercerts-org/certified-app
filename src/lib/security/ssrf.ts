import "server-only"
import dns from "node:dns"
import { isIP } from "node:net"
import ipaddr from "ipaddr.js"
import type { Agent as UndiciAgent, buildConnector as UndiciBuildConnector } from "undici"
// Deep imports on purpose: undici's index (lib/global.js) installs its own
// Agent as the process-wide fetch dispatcher on load, which would move every
// fetch in the app (Upstash, Resend, ...) off Node's bundled undici. These
// two modules don't touch it. Types come from the package index.
import AgentImpl from "undici/lib/dispatcher/agent.js"
import buildConnectorImpl from "undici/lib/core/connect.js"

const Agent = AgentImpl as typeof UndiciAgent
const buildConnector = buildConnectorImpl as typeof UndiciBuildConnector

/**
 * SSRF guard for server-side fetches whose URL a visitor can choose
 * (TECH-811): did:web documents, handle `/.well-known/atproto-did`, PDS
 * endpoints read from DID documents, and everything the OAuth client
 * fetches during sign-in (metadata, PAR, token).
 *
 * The check runs in the connection itself, through an undici dispatcher:
 * - a hostname is resolved once, every address must be public unicast,
 *   and the connection uses the address that was checked (no DNS-rebinding
 *   window between check and connect);
 * - a literal IP host (which skips DNS) must be public unicast too;
 * - each redirect hop opens its own connection, so it is checked as well.
 *
 * `isAllowedPdsUrl` (src/lib/atproto/did.ts) stays as a cheap early reject
 * on the URL string; it can't see what a hostname resolves to.
 *
 * Why not atproto's `safeFetchWrap`: on Node >= 20 it hands the dispatcher
 * to fetch on a `Request` object, and Next's patched fetch rebuilds Request
 * inputs from a fixed field list that drops `dispatcher` (next
 * dist/server/lib/patch-fetch.js), so the guard would silently not apply.
 * We pass it on `init` instead, which Next forwards.
 *
 * The Agent comes from the `undici` package and is handed to Node's bundled
 * fetch. Production (Node 24) bundles undici 7, matching our dependency; an
 * undici 6 Agent fails every request on newer Node, while our 7 also works on
 * Node 26's undici 8. Re-verify on a Node major bump. The instrumentation and
 * route bundles may each load a copy (two small pools; the slot below holds
 * whichever loaded last).
 */

export class SsrfBlockedError extends Error {
  constructor(host: string) {
    super(`Refusing to connect to non-public address for ${host}`)
    this.name = "SsrfBlockedError"
  }
}

const GLOBAL_UNICAST_V6 = ipaddr.parseCIDR("2000::/3")

/** Public unicast only. An IPv4-mapped IPv6 address is judged by the IPv4
 *  address it carries. Other IPv6 must also be global unicast (2000::/3):
 *  ipaddr calls the IPv4-compatible block `::/96` (e.g. `::7f00:1`, which
 *  the URL parser makes of `[::127.0.0.1]`) "unicast" too. NAT64, 6to4 and
 *  Teredo forms are refused outright. */
export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address)
    if (parsed.kind() === "ipv4") return parsed.range() === "unicast"
    const v6 = parsed as ipaddr.IPv6
    if (v6.isIPv4MappedAddress()) return v6.toIPv4Address().range() === "unicast"
    return v6.range() === "unicast" && v6.match(GLOBAL_UNICAST_V6)
  } catch {
    return false
  }
}

type LookupOptions = dns.LookupOptions
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void

/** A dns.lookup that fails unless every resolved address is allowed. */
function checkedLookup(isAllowed: (address: string) => boolean) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      if (addresses.length === 0 || addresses.some((a) => !isAllowed(a.address))) {
        return callback(new SsrfBlockedError(hostname), [])
      }
      if (options.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

/** An undici dispatcher that only connects to allowed (by default: public)
 *  addresses. Tests pass a narrower predicate to exercise it locally. */
export function createGuardedAgent(isAllowed: (address: string) => boolean = isPublicAddress) {
  const connect = buildConnector({ lookup: checkedLookup(isAllowed) as never })
  return new Agent({
    connect: (opts, callback) => {
      const host = opts.hostname.replace(/^\[|\]$/g, "")
      if (isIP(host) && !isAllowed(host)) {
        callback(new SsrfBlockedError(host), null)
        return
      }
      return connect(opts, callback)
    },
  })
}

const agent = createGuardedAgent()

/** Local development only: allow private addresses (e.g. a PDS on the LAN). */
function guardDisabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PRIVATE_NETWORK_FETCH === "true"
  )
}

/**
 * `fetch` for URLs a visitor can influence. Takes a URL, not a Request: the
 * dispatcher must travel on `init` (see above). Blocked connections reject
 * like any network failure (TypeError "fetch failed", cause
 * SsrfBlockedError), so callers' existing error handling applies.
 */
export function guardedFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (guardDisabled()) return globalThis.fetch(input, init)
  return globalThis.fetch(input, { ...init, dispatcher: agent } as RequestInit)
}

/**
 * src/lib/atproto/did.ts is also bundled for the browser, so it can't import
 * this module; it looks the guarded fetch up here instead. A process-wide
 * slot (not a setter on did.ts) because Next may load separate copies of a
 * module for instrumentation and for route bundles. Filled on import, and
 * src/instrumentation.ts imports this at server start.
 */
export const GUARDED_FETCH_SLOT = Symbol.for("certified-app.guardedFetch")
;(globalThis as Record<symbol, unknown>)[GUARDED_FETCH_SLOT] = guardedFetch
