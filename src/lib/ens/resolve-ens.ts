/**
 * Client helpers for turning a raw Ethereum address into a display-ready
 * ENS name. Resolution goes through our own `/api/ens` proxy (see that
 * route for why); this module adds the address validation, the
 * `0x1234…abcd` shortening, and a process-lifetime cache + in-flight
 * coalescer so a list rendering the same address in many rows resolves it
 * once. Mirrors the dedupe/cache shape of `resolve-did-batch`.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** True when `value` is a syntactically valid 0x-prefixed 20-byte address. */
export function isEthereumAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && ADDRESS_RE.test(value.trim())
}

/**
 * Shorten a wallet address to `0x1234…abcd` for dense inline display.
 * Non-address strings pass through unchanged so the helper is safe to call
 * on any funding-party text value.
 */
export function shortenAddress(value: string): string {
  const v = value.trim()
  if (!isEthereumAddress(v)) return value
  return `${v.slice(0, 6)}…${v.slice(-4)}`
}

/** A resolved ENS identity: primary name + avatar, either of which may be
 *  null. `EMPTY` is the shared "resolved, but nothing found" value. */
export interface EnsProfile {
  name: string | null
  avatar: string | null
}

const EMPTY: EnsProfile = { name: null, avatar: null }

// Resolved profiles live for the page's lifetime — ENS records are
// effectively static across a session, and the /api/ens route already
// owns the real TTL. A cached `EMPTY` means "looked up, nothing found" so
// we don't re-request addresses that lack a reverse record.
const cache = new Map<string, EnsProfile>()
const inFlight = new Map<string, Promise<EnsProfile>>()

/**
 * Reverse-resolve `address` to its ENS name + avatar (either may be null,
 * `EMPTY` when it has none / resolution fails — never rejects). Concurrent
 * callers for the same address share one request; results are cached for
 * the session.
 */
export function resolveEns(address: string): Promise<EnsProfile> {
  const key = address.trim().toLowerCase()
  if (!isEthereumAddress(key)) return Promise.resolve(EMPTY)
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? EMPTY)
  const pending = inFlight.get(key)
  if (pending) return pending

  const request = fetch(`/api/ens?address=${encodeURIComponent(key)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { name?: string | null; avatar?: string | null } | null) => {
      const profile: EnsProfile = {
        name:
          data && typeof data.name === "string" && data.name.length > 0
            ? data.name
            : null,
        avatar:
          data && typeof data.avatar === "string" && data.avatar.length > 0
            ? data.avatar
            : null,
      }
      cache.set(key, profile)
      return profile
    })
    .catch(() => {
      // Cache the miss so the lookup settles (no stuck loading state) and
      // we don't re-hit a failing upstream every render. The /api/ens
      // route doesn't cache its error path, so a full reload still retries.
      cache.set(key, EMPTY)
      return EMPTY
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

/** Synchronously read an already-resolved profile from the cache, if
 *  present. Lets a hook seed its initial state without a loading flash on
 *  re-render of an address resolved earlier in the session. Returns
 *  `undefined` when the address hasn't been resolved yet (distinct from a
 *  cached "nothing found"). */
export function peekEns(address: string): EnsProfile | undefined {
  return cache.get(address.trim().toLowerCase())
}
