interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

const DID_FETCH_TIMEOUT_MS = 5000

/**
 * Parse a hostname as a loose IPv4 literal the way glibc `inet_aton`
 * (undici's resolver) does: 1-4 dot-separated parts, each decimal,
 * octal (leading `0`) or hex (leading `0x`), with the a / a.b / a.b.c /
 * a.b.c.d field-packing forms. Returns the 32-bit address, or null when
 * the host is not a numeric IPv4 literal (a real DNS name resolved
 * normally). This catches the non-canonical encodings — `2130706433`,
 * `0x7f.0.0.1`, `0177.0.0.1`, `127.1` — that all collapse to an
 * internal address but slip past a plain dotted-quad check.
 */
function parseIpv4Loose(host: string): number | null {
  const parts = host.split(".")
  if (parts.length === 0 || parts.length > 4) return null

  const nums: number[] = []
  for (const part of parts) {
    let value: number
    if (/^0x[0-9a-f]+$/i.test(part)) {
      value = parseInt(part.slice(2), 16)
    } else if (/^0[0-7]+$/.test(part)) {
      value = parseInt(part, 8)
    } else if (/^(0|[1-9][0-9]*)$/.test(part)) {
      value = parseInt(part, 10)
    } else {
      // A non-numeric label → this is a DNS name, not an IP literal.
      return null
    }
    if (!Number.isFinite(value) || value < 0) return null
    nums.push(value)
  }

  const n = nums.length
  if (n === 1) {
    if (nums[0] > 0xffffffff) return null
    return nums[0] >>> 0
  }
  if (n === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null
    return ((nums[0] << 24) | nums[1]) >>> 0
  }
  if (n === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null
    return ((nums[0] << 24) | (nums[1] << 16) | nums[2]) >>> 0
  }
  if (nums.some((x) => x > 0xff)) return null
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

/** Range-check a 32-bit IPv4 against the loopback / private / CGNAT /
 *  link-local / unspecified blocks that must never be reachable through
 *  a server-side proxy. */
function isBlockedIpv4(addr: number): boolean {
  const a = (addr >>> 24) & 0xff
  const b = (addr >>> 16) & 0xff
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  return false
}

/**
 * Gate an outbound PDS URL against SSRF. Requires https, blocks
 * localhost, IPv6 loopback/link-local/ULA/unspecified/IPv4-mapped, and
 * every IPv4 private range — including the non-canonical decimal / hex /
 * octal encodings a naive dotted-quad check misses.
 *
 * This validates the host STRING only; it does not resolve DNS, so a
 * public name that resolves to an internal address (DNS rebinding) is
 * out of scope here — mitigated by `redirect: "error"` on the callers
 * and the fetch timeouts.
 */
export function isAllowedPdsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname;
    if (hostname === "localhost") return false;

    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      const inner = hostname.slice(1, -1).toLowerCase()
      if (
        inner === "::1" ||
        inner === "::" ||
        inner.startsWith("fe80:") ||
        inner.startsWith("fc") ||
        inner.startsWith("fd") ||
        inner.startsWith("::ffff:")
      ) {
        return false
      }
      return true
    }

    const bare = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname
    const ipv4 = parseIpv4Loose(bare)
    if (ipv4 !== null && isBlockedIpv4(ipv4)) return false

    return true;
  } catch {
    return false;
  }
}

// Process-local cache for DID documents. DID docs change infrequently
// (PLC mirror responses are themselves cached for minutes), so a short
// TTL collapses the per-render N+1 pattern (a single page resolving
// the same DID across multiple components) into one upstream call.
// Successes get a 5-minute TTL; null results (resolution failures) get
// a 30s TTL so a transient upstream blip clears quickly.
const DID_DOC_TTL_OK_MS = 5 * 60 * 1000;
const DID_DOC_TTL_NULL_MS = 30 * 1000;

interface DidDocCacheEntry {
  expiresAt: number;
  doc: DidDocument | null;
}

// Bound the map size so a long-running process (or a malicious caller
// feeding synthetic DIDs) can't grow it unboundedly. FIFO eviction is
// fine because every entry expires anyway — the cap just protects
// against pre-expiry growth.
const DID_DOC_CACHE_MAX = 1000;

const didDocCache = new Map<string, DidDocCacheEntry>();
const didDocInflight = new Map<string, Promise<DidDocument | null>>();

// Per-DID generation counter, bumped on every invalidate. A fetch
// captures the generation at start; if it changed by the time the
// fetch resolves, the result is dropped instead of overwriting the
// (now-known-stale) cache. Without this, the race goes:
//   t0: fetch starts → reads pre-update PLC doc
//   t1: caller invalidateDidDoc() — cache is already empty, no-op
//   t2: fetch from t0 resolves and writes stale doc with 5-min TTL
const didDocGen = new Map<string, number>();

/**
 * Drop a DID from the cache. Call this whenever the upstream document
 * changes — most importantly after `com.atproto.identity.updateHandle`,
 * which rewrites `alsoKnownAs` and would otherwise serve the old handle
 * for up to DID_DOC_TTL_OK_MS. Bumps the generation so any inflight
 * fetch started before this call won't seat a stale doc.
 */
export function invalidateDidDoc(did: string): void {
  didDocCache.delete(did);
  didDocGen.set(did, (didDocGen.get(did) ?? 0) + 1);
}

/**
 * Construct the URL for a DID document and fetch it with a timeout.
 * Shared by resolveHandle and resolvePdsUrl. Results are memoized
 * per-process for a short TTL, and concurrent callers share the same
 * in-flight promise (singleflight) so a burst collapses to one fetch.
 */
async function fetchDidDocument(did: string): Promise<DidDocument | null> {
  const now = Date.now();
  const cached = didDocCache.get(did);
  if (cached && cached.expiresAt > now) return cached.doc;

  const inflight = didDocInflight.get(did);
  if (inflight) return inflight;

  // Snapshot the generation at fetch start. If invalidateDidDoc(did)
  // is called while we're in flight, the generation will diverge and
  // we'll drop our result instead of caching it.
  const generationAtStart = didDocGen.get(did) ?? 0;

  const promise = (async (): Promise<DidDocument | null> => {
    let url: string;

    if (did.startsWith("did:plc:")) {
      url = `https://plc.directory/${did}`;
    } else if (did.startsWith("did:web:")) {
      const withoutPrefix = did.slice("did:web:".length);
      const parts = withoutPrefix.split(":");
      const domain = parts[0];
      const path = parts.length > 1 ? parts.slice(1).join("/") : ".well-known";
      url = `https://${domain}/${path}/did.json`;
      if (!isAllowedPdsUrl(url)) return null;
    } else {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DID_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return null;

    try {
      return (await response.json()) as DidDocument;
    } catch {
      return null;
    }
  })();

  didDocInflight.set(did, promise);

  try {
    const doc = await promise;
    // If something called invalidateDidDoc while we were in flight,
    // our result is already known-stale. Return it (callers asked for
    // a doc, not a guarantee) but don't seat it in the cache.
    const generationAtFinish = didDocGen.get(did) ?? 0;
    if (generationAtFinish !== generationAtStart) return doc;
    // Evict the oldest entry once we exceed the cap. Map preserves
    // insertion order, so the first key is the oldest.
    if (didDocCache.size >= DID_DOC_CACHE_MAX && !didDocCache.has(did)) {
      const firstKey = didDocCache.keys().next().value;
      if (firstKey !== undefined) didDocCache.delete(firstKey);
    }
    didDocCache.set(did, {
      doc,
      expiresAt: Date.now() + (doc ? DID_DOC_TTL_OK_MS : DID_DOC_TTL_NULL_MS),
    });
    return doc;
  } finally {
    didDocInflight.delete(did);
  }
}

/**
 * Resolve a handle to its DID via the `.well-known/atproto-did` endpoint
 * on the handle's domain. This is the AT Protocol standard resolution
 * path and works for custom-domain handles that may not have a DNS TXT
 * record (which Bluesky's public appView requires).
 *
 * See: https://atproto.com/specs/handle#handle-resolution
 */
export async function resolveHandleViaWellKnown(handle: string): Promise<string | null> {
  // Anti-SSRF: `handle` is fully client-controlled and is interpolated
  // into an outbound URL. Reject anything that isn't a bare DNS hostname
  // (no port / userinfo / path / percent-encoded chars), and require a
  // real dotted name with an alphabetic TLD — so an IP literal, host:port
  // or `10.0.0.5`-style value can never reach the fetch. Then run the
  // constructed URL through the SAME gate resolvePdsUrl uses.
  if (/[:@/%\s]/.test(handle)) return null
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
      handle,
    )
  ) {
    return null
  }

  const url = `https://${handle}/.well-known/atproto-did`
  if (!isAllowedPdsUrl(url)) return null

  try {
    const res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    // Must be a valid DID
    if (text.startsWith("did:")) return text
    return null
  } catch {
    return null
  }
}

/** Bluesky's public appView — unauthenticated handle resolution. */
const BSKY_APPVIEW = "https://public.api.bsky.app"

/**
 * Resolve a handle (e.g. `alice.bsky.social`) to its DID via Bluesky's
 * public appView. Returns null if resolution fails.
 */
export async function resolveHandleToDid(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BSKY_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(5_000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { did?: string }
    return data.did ?? null
  } catch {
    return null
  }
}

/**
 * Resolves a DID to its handle from the DID document's alsoKnownAs field.
 * The handle is extracted from the `at://` URI in alsoKnownAs.
 */
export async function resolveHandle(did: string): Promise<string | null> {
  try {
    const doc = await fetchDidDocument(did);
    if (!doc || !Array.isArray(doc.alsoKnownAs)) return null;

    const atUri = doc.alsoKnownAs.find((aka) => typeof aka === "string" && aka.startsWith("at://"));
    if (!atUri) return null;

    const handle = atUri.replace("at://", "");
    // The DID document (especially for attacker-controllable did:web)
    // can carry an arbitrary at:// value like `at://example.com/some/path`.
    // Sanity-check the stripped value actually looks like a handle so a
    // non-handle (path, empty, or whitespace-bearing string) doesn't leak.
    if (!handle || !handle.includes(".") || /[/\s]/.test(handle)) return null;

    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    console.warn(`resolveHandle failed for ${did}:`, err);
    return null;
  }
}

/**
 * Resolves a DID to its PDS service endpoint URL by fetching the DID document.
 *
 * - For `did:plc:` DIDs, fetches from `https://plc.directory/{did}`
 * - For `did:web:` DIDs, fetches from `https://{domain}/.well-known/did.json`
 *
 * @param did - The DID to resolve (e.g. "did:plc:abc123")
 * @returns The PDS service endpoint URL, or null if resolution fails
 */
export async function resolvePdsUrl(did: string): Promise<string | null> {
  try {
    const doc = await fetchDidDocument(did);
    if (!doc || !Array.isArray(doc.service)) return null;

    const pdsService = doc.service.find((s) =>
      typeof s.id === "string" && (s.id === "#atproto_pds" || s.id.endsWith("#atproto_pds"))
    );

    if (!pdsService) return null;

    if (!pdsService.serviceEndpoint || typeof pdsService.serviceEndpoint !== "string") {
      return null;
    }

    if (!isAllowedPdsUrl(pdsService.serviceEndpoint)) {
      return null;
    }

    return pdsService.serviceEndpoint;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    console.warn(`resolvePdsUrl failed for ${did}:`, err);
    return null;
  }
}
