import { NodeOAuthClient } from "@atproto/oauth-client-node"
import { JoseKey } from "@atproto/jwk-jose"
import {
  buildAtprotoLoopbackClientMetadata,
  type OAuthClientMetadataInput,
  type OAuthLoopbackRedirectURI,
} from "@atproto/oauth-types"
import { RedisStateStore, RedisSessionStore } from "./stores"
import { PUBLIC_URL_STRICT, DEFAULT_PDS_URL } from "@/lib/utils/config"

export const PDS_URL = process.env.PDS_URL || DEFAULT_PDS_URL

let clientPromise: Promise<NodeOAuthClient> | null = null

const SCOPE = "atproto transition:generic identity:handle account:email"

/** Whether the resolved canonical URL requires atproto's loopback client. */
export function isLoopbackOAuthMode(
  publicUrl: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === "production") return false
  return publicUrl?.startsWith("http://") ?? true
}

/**
 * Builds the spec-required loopback callback. The client_id host is localhost,
 * but redirect_uri must use a loopback IP; preserve the configured dev port.
 */
export function buildLoopbackRedirectUri(
  publicUrl: string | undefined,
): OAuthLoopbackRedirectURI {
  let port = "3000"
  if (publicUrl) {
    const parsed = new URL(publicUrl)
    if (parsed.port) port = parsed.port
  }
  return `http://127.0.0.1:${port}/oauth/callback` as OAuthLoopbackRedirectURI
}

/** Returns a production-safe canonical URL or throws an actionable error. */
export function requireOAuthPublicUrl(
  publicUrl: string | undefined,
  nodeEnv: string | undefined,
): string {
  if (!publicUrl) {
    throw new Error(
      "OAuth public URL is not configured. Set PUBLIC_URL, or expose VERCEL_BRANCH_URL or VERCEL_URL in the production runtime.",
    )
  }
  if (nodeEnv === "production" && !publicUrl.startsWith("https://")) {
    throw new Error(
      "OAuth public URL must use HTTPS in production. Use npm run dev for HTTP loopback OAuth, or configure an HTTPS PUBLIC_URL, VERCEL_BRANCH_URL, or VERCEL_URL.",
    )
  }
  return publicUrl
}

/** Builds the non-loopback OAuth metadata published by the well-known route. */
export function buildWebOAuthClientMetadata(
  publicUrl: string,
  isConfidential: boolean,
): OAuthClientMetadataInput {
  return {
    client_id: `${publicUrl}/.well-known/oauth-client-metadata`,
    client_name: "Certified",
    client_uri: publicUrl,
    logo_uri: `${publicUrl}/brand/brandmark/certified_brandmark_black_512.png`,
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
}

export function getOAuthClient(): Promise<NodeOAuthClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      let clientMetadata: OAuthClientMetadataInput
      let keyset: Awaited<ReturnType<typeof JoseKey.fromImportable>>[] | undefined

      if (isLoopbackOAuthMode(PUBLIC_URL_STRICT, process.env.NODE_ENV)) {
        // ATPROTO_PRIVATE_KEY is ignored here — the helper hard-codes
        // token_endpoint_auth_method: "none".
        clientMetadata = buildAtprotoLoopbackClientMetadata({
          scope: SCOPE,
          redirect_uris: [buildLoopbackRedirectUri(PUBLIC_URL_STRICT)],
        })
        keyset = undefined
      } else {
        const publicUrl = requireOAuthPublicUrl(
          PUBLIC_URL_STRICT,
          process.env.NODE_ENV,
        )
        const isConfidential = Boolean(process.env.ATPROTO_PRIVATE_KEY)

        clientMetadata = buildWebOAuthClientMetadata(publicUrl, isConfidential)

        keyset = isConfidential
          ? [await JoseKey.fromImportable(process.env.ATPROTO_PRIVATE_KEY!, "key-1")]
          : undefined
      }

      return new NodeOAuthClient({
        clientMetadata,
        stateStore: new RedisStateStore(),
        sessionStore: new RedisSessionStore(),
        handleResolver: PDS_URL,
        fetch: safeFetch,
        ...(keyset ? { keyset } : {}),
      })
    })()
    clientPromise.catch(() => { clientPromise = null }) // reset on failure
  }
  return clientPromise
}

// Workaround for vercel/next.js#90826: on Node ≥ 24.14, Next.js's patched
// fetch throws `expected non-null body source` when given a Request whose
// body has been consumed and the response is an error. The atproto DPoP
// wrapper passes a Request to fetch, and bsky's PDS reliably returns 401 +
// DPoP-Nonce on the first hit, triggering the bug. Buffer the body once and
// re-issue with (url, init) form so Next.js's wrapper never sees a Request.
//
// Reach: this also protects token refresh and revoke. The same DPoP wrapper
// handles auth-server traffic, and bsky's auth server also returns nonce
// challenges, so `client.restore(did)` (which can trigger refresh) was
// affected by the same bug for bsky-hosted accounts.
//
// Note on uploadBlob: the route handler in `src/app/api/xrpc/[...method]`
// already buffers the upload to an ArrayBuffer (capped at 4 MB), and the
// atproto Agent then constructs a Request whose body we buffer again here.
// Peak transient memory ~12 MB; ~24 MB worst case on a nonce-retry. Well
// under Vercel's 1 GB function memory.
const safeFetch: typeof fetch = async (input, init) => {
  if (input instanceof Request) {
    // Body handling:
    //   input.body === null   → no body was provided; pass `body: undefined`.
    //   input.body !== null   → body exists (even if 0 bytes); buffer and
    //                           forward, preserving Content-Length: 0 for
    //                           empty-but-explicit POSTs like
    //                           com.atproto.server.requestEmailUpdate.
    // If arrayBuffer() rejects (consumed body, abort mid-stream), rethrow
    // with a stable error name so the failure is greppable in logs and the
    // surrounding xrpc-route try/catch can mask it to the client as usual.
    let buffer: ArrayBuffer | undefined
    if (input.body) {
      try {
        buffer = await input.arrayBuffer()
      } catch (err) {
        const wrapped = new Error(
          `safeFetch: failed to buffer Request body (${(err as Error)?.message ?? "unknown"})`
        )
        wrapped.name = "SafeFetchBodyReadError"
        throw wrapped
      }
    }

    // The dpop wrapper currently invokes us as `fetch.call(this, request)`
    // with no second argument, so `init` is null in practice. Don't spread
    // it — if a future caller did pass `init.body`, the spread would
    // overwrite our buffered body and re-introduce the very bug this fix
    // prevents. Any caller-provided `init.signal` is intentionally dropped
    // together with `init` (the Request's own signal is forwarded below).
    if (init != null && process.env.NODE_ENV !== "production") {
      // Dev-only canary: if a future @atproto/oauth-client release changes
      // its call convention, this fires loudly in test runs so we notice
      // before the bug returns in prod.
      console.warn(
        "[safeFetch] unexpected init alongside Request — body buffering may need revisit"
      )
    }

    return globalThis.fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body ? buffer : undefined,
      // Request always carries a signal (synthesizes one if none was
      // provided); forwarding it keeps AbortSignal.timeout chains intact.
      signal: input.signal,
      redirect: input.redirect,
      credentials: input.credentials,
      cache: input.cache,
    })
  }
  return globalThis.fetch(input, init)
}
