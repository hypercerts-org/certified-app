import "server-only"
import dns from "node:dns"
import { isIP } from "node:net"
import ipaddr from "ipaddr.js"
import { Agent, buildConnector } from "undici"

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
 * We pass it on `init` instead, which Next forwards. The `undici` package
 * must stay on the major Node bundles (Node 24: undici 7); an undici 6 Agent
 * fails every request on newer Node.
 */

export class SsrfBlockedError extends Error {
  constructor(host: string) {
    super(`Refusing to connect to non-public address for ${host}`)
    this.name = "SsrfBlockedError"
  }
}

/** Public unicast only. An IPv4-mapped IPv6 address is judged by the IPv4
 *  address it carries; NAT64, 6to4 and Teredo forms are refused outright. */
export function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address)
    if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address()
    }
    return parsed.range() === "unicast"
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
