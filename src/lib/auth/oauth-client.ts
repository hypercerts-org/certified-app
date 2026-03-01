import { NodeOAuthClient } from "@atproto/oauth-client-node"
import { JoseKey } from "@atproto/jwk-jose"
import type { OAuthClientMetadataInput } from "@atproto/oauth-types"
import { RedisStateStore, RedisSessionStore } from "./stores"

export const PDS_URL =
  process.env.PDS_URL ||
  process.env.NEXT_PUBLIC_PDS_URL ||
  "https://otp.certs.network"

let clientInstance: NodeOAuthClient | null = null

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (clientInstance) return clientInstance

  const publicUrl =
    process.env.PUBLIC_URL ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:3000")

  if (!publicUrl) {
    throw new Error("PUBLIC_URL environment variable is required in production")
  }

  const isConfidential = Boolean(process.env.ATPROTO_PRIVATE_KEY)

  const clientMetadata: OAuthClientMetadataInput = {
    client_id: `${publicUrl}/.well-known/oauth-client-metadata`,
    client_name: "Certified",
    client_uri: publicUrl,
    logo_uri: `${publicUrl}/assets/certified_brandmark.png`,
    redirect_uris: [`${publicUrl}/oauth/callback`],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    scope: "atproto transition:generic identity:handle account:email",
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

  const keyset = isConfidential
    ? [await JoseKey.fromImportable(process.env.ATPROTO_PRIVATE_KEY!, "key-1")]
    : undefined

  clientInstance = new NodeOAuthClient({
    clientMetadata,
    stateStore: new RedisStateStore(),
    sessionStore: new RedisSessionStore(),
    handleResolver: PDS_URL,
    ...(keyset ? { keyset } : {}),
  })

  return clientInstance
}
