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
 */
function loopbackRedirectUri(): OAuthLoopbackRedirectURI {
  let port = "3000"
  const url = process.env.PUBLIC_URL
  if (url) {
    try {
      const parsed = new URL(url)
      if (parsed.port) port = parsed.port
    } catch {
      /* keep default */
    }
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

  clientInstance = new NodeOAuthClient({
    clientMetadata,
    stateStore: new RedisStateStore(),
    sessionStore: new RedisSessionStore(),
    handleResolver: PDS_URL,
    ...(keyset ? { keyset } : {}),
  })

  return clientInstance
}
