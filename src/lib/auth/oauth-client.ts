import "server-only";

import { safeFetchWrap } from "@atproto-labs/fetch-node";
import {
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  NodeOAuthClient,
  type OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import { CALLBACK_PATH, OAUTH_SCOPE, oauthMode } from "./config";
import { requestLock } from "./lock";
import { sessionStore, stateStore } from "./stores";

// Every request the OAuth client makes goes through atproto's safe fetch. A
// visitor chooses which PDS, authorization server and DID document the server
// contacts, so connections to non-public addresses are refused (on every
// redirect hop) and responses are size-capped: the client validates metadata
// and token responses with zod 3, which has no fix for large-array memory
// exhaustion (GHSA-mrhx-c7xc-m3w5, TECH-804).
const fetch = safeFetchWrap({ allowImplicitRedirect: true });

function webClientMetadata(publicUrl: string, confidential: boolean): OAuthClientMetadataInput {
  return {
    client_id: `${publicUrl}/.well-known/oauth-client-metadata`,
    client_name: "Certified",
    client_uri: publicUrl,
    logo_uri: `${publicUrl}/brand/brandmark/certified_brandmark_black_512.png`,
    redirect_uris: [`${publicUrl}${CALLBACK_PATH}`],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    scope: OAUTH_SCOPE,
    dpop_bound_access_tokens: true,
    application_type: "web",
    ...(confidential
      ? {
          token_endpoint_auth_method: "private_key_jwt",
          token_endpoint_auth_signing_alg: "ES256",
          jwks_uri: `${publicUrl}/.well-known/jwks.json`,
        }
      : { token_endpoint_auth_method: "none" }),
  };
}

async function createClient(): Promise<NodeOAuthClient> {
  const mode = oauthMode();
  // A confidential client authenticates to the authorization server with this
  // key, which gets longer-lived sessions. Loopback clients are always public.
  const privateKey = mode.kind === "web" ? process.env.OAUTH_PRIVATE_KEY : undefined;
  const keyset = privateKey ? [await JoseKey.fromImportable(privateKey, "key-1")] : undefined;
  const clientMetadata =
    mode.kind === "web"
      ? webClientMetadata(mode.publicUrl, keyset !== undefined)
      : buildAtprotoLoopbackClientMetadata({
          scope: OAUTH_SCOPE,
          redirect_uris: [mode.redirectUri],
        });
  return new NodeOAuthClient({
    clientMetadata,
    keyset,
    stateStore,
    sessionStore,
    requestLock,
    fetch,
  });
}

let client: Promise<NodeOAuthClient> | undefined;

/** The process-wide OAuth client. A failed setup is retried on the next call. */
export function getOAuthClient(): Promise<NodeOAuthClient> {
  if (!client) {
    client = createClient();
    client.catch(() => {
      client = undefined;
    });
  }
  return client;
}
