import { NodeOAuthClient } from "@atproto/oauth-client-node"
import { JoseKey } from "@atproto/jwk-jose"
import {
  buildAtprotoLoopbackClientMetadata,
  type OAuthClientMetadataInput,
  type OAuthLoopbackRedirectURI,
} from "@atproto/oauth-types"
import { RedisStateStore, RedisSessionStore } from "./stores"
import { PUBLIC_URL_STRICT } from "@/lib/utils/config"

export const PDS_URL =
  process.env.PDS_URL ||
  process.env.NEXT_PUBLIC_PDS_URL ||
  "https://certified.one"

let clientInstance: NodeOAuthClient | null = null

/**
 * True when we're running on a developer machine and there is no real
 * https:// PUBLIC_URL to register as a client_id.
 *
 * The atproto OAuth spec only accepts client_ids that are either:
 *   1. fully-qualified `https://` URLs, or
 *   2. the literal `http://localhost` loopback origin (no port, no path,
 *      optional query string carrying redirect_uris and scope).
 *
 * IP addresses (`127.0.0.1`, `[::1]`) are not allowed as the client_id
 * origin — but they ARE the only allowed redirect_uri hosts in loopback
 * mode. So in dev we use the standard loopback helper to build virtual
 * metadata that satisfies both rules at once.
 *
 * Detected as: NODE_ENV !== "production" AND PUBLIC_URL is missing or
 * starts with `http://` (i.e. you're not pointing at a real HTTPS host).
 */
function isLoopbackDev(): boolean {
  if (process.env.NODE_ENV === "production") return false
  const url = process.env.PUBLIC_URL
  return !url || url.startsWith("http://")
}

/**
 * Build the loopback redirect_uri. The host must be `127.0.0.1` (or
 * `[::1]`) — `localhost` is explicitly NOT allowed by the atproto spec
 * for redirect_uris, even though it IS the only allowed client_id host.
 *
 * The port is taken from PUBLIC_URL when present, else defaults to 3000
 * (Next.js's default dev port).
 *
 * Fails fast if PUBLIC_URL points at `localhost` — the redirect_uri would
 * land on a different origin than the browser, breaking cookies and the
 * iframe postMessage callback.
 */
function loopbackRedirectUri(): OAuthLoopbackRedirectURI {
  let port = "3000"
  const url = process.env.PUBLIC_URL
  if (url) {
    let parsed: URL | null = null
    try { parsed = new URL(url) } catch { /* malformed, fall through */ }
    if (parsed?.hostname === "localhost") {
      throw new Error(
        'PUBLIC_URL must use 127.0.0.1 in dev, not localhost. RFC 8252 forbids ' +
        '"localhost" as an OAuth loopback redirect_uri host, and cookies do not ' +
        'cross localhost ↔ 127.0.0.1. Set PUBLIC_URL=http://127.0.0.1:3000 and ' +
        'browse to 127.0.0.1.'
      )
    }
    if (parsed?.port) port = parsed.port
  }
  return `http://127.0.0.1:${port}/oauth/callback` as OAuthLoopbackRedirectURI
}

const SCOPE = "atproto transition:generic identity:handle account:email"

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (clientInstance) return clientInstance

  let clientMetadata: OAuthClientMetadataInput
  let keyset: Awaited<ReturnType<typeof JoseKey.fromImportable>>[] | undefined

  if (isLoopbackDev()) {
    // Dev: virtual `http://localhost?...` client_id with a 127.0.0.1
    // redirect_uri. token_endpoint_auth_method is forced to "none" by the
    // helper, so any ATPROTO_PRIVATE_KEY is ignored here on purpose.
    clientMetadata = buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [loopbackRedirectUri()],
    })
    keyset = undefined
  } else {
    // Production: real client_id pointing at /.well-known/oauth-client-metadata.
    const publicUrl = PUBLIC_URL_STRICT
    if (!publicUrl) {
      throw new Error("PUBLIC_URL environment variable is required in production")
    }

    const isConfidential = Boolean(process.env.ATPROTO_PRIVATE_KEY)

    clientMetadata = {
      client_id: `${publicUrl}/.well-known/oauth-client-metadata`,
      client_name: "Certified",
      client_uri: publicUrl,
      logo_uri: `${publicUrl}/assets/certified_brandmark_black.png`,
      redirect_uris: [`${publicUrl}/oauth/callback`],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      scope: SCOPE,
      dpop_bound_access_tokens: true,
      application_type: "web",
      ...(isConfidential
        ? {
            token_endpoint_auth_method: "private_key_jwt",
            token_endpoint_auth_signing_alg: "ES256",
            jwks_uri: `${publicUrl}/.well-known/jwks.json`,
          }
        : {
            token_endpoint_auth_method: "none",
          }),
    }

    keyset = isConfidential
      ? [await JoseKey.fromImportable(process.env.ATPROTO_PRIVATE_KEY!, "key-1")]
      : undefined
  }

  // Note: we intentionally do NOT pass `handleResolver` here. The default
  // `AtprotoHandleResolverNode` does proper DNS-TXT + HTTP-well-known
  // resolution and works for any atproto handle (Certified, Bluesky,
  // custom domain). Passing `handleResolver: PDS_URL` would force the
  // OAuth client to call certified.one's resolveHandle XRPC for every
  // input, which fails for handles certified.one doesn't host (e.g.
  // any *.bsky.social handle). Email-mode logins pass `PDS_URL` directly
  // to `client.authorize`, so this change doesn't affect them.
  clientInstance = new NodeOAuthClient({
    clientMetadata,
    stateStore: new RedisStateStore(),
    sessionStore: new RedisSessionStore(),
    fetch: safeFetch,
    ...(keyset ? { keyset } : {}),
  })

  return clientInstance
}

// Workaround for vercel/next.js#90826: on Node ≥ 24.14, Next.js's patched
// fetch throws `expected non-null body source` when given a Request whose
// body has been consumed and the response is an error. The atproto DPoP
// wrapper passes a Request to fetch, and bsky's PDS reliably returns 401 +
// DPoP-Nonce on the first hit, triggering the bug. Buffer the body once and
// re-issue with (url, init) form so Next.js's wrapper never sees a Request.
const safeFetch: typeof fetch = async (input, init) => {
  if (input instanceof Request) {
    const buffer = input.body ? await input.arrayBuffer() : undefined
    return globalThis.fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: buffer && buffer.byteLength > 0 ? buffer : undefined,
      signal: input.signal,
      redirect: input.redirect,
      credentials: input.credentials,
      cache: input.cache,
      ...init,
    })
  }
  return globalThis.fetch(input, init)
}
