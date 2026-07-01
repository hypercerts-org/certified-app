import type { Agent } from "@atproto/api"

/**
 * Mint a short-lived AT Protocol service-auth JWT via the user's PDS.
 *
 * The JWT carries:
 *   iss = the user's DID (from the OAuth agent / PDS signature)
 *   aud = the audience DID (caller-supplied — must match the target
 *         service's expected audience exactly)
 *   lxm = the lexicon method the token is scoped to
 *   exp = ~60s in the future (set by the PDS)
 *   jti = random nonce (set by the PDS; replay protection downstream)
 *
 * The returned token is one-shot: downstream services typically track
 * `jti` and reject reuse. Mint fresh per request.
 */
export async function getServiceAuthToken(
  agent: Agent,
  aud: string,
  lxm: string,
  opts?: { signal?: AbortSignal },
): Promise<string> {
  const { data } = await agent.com.atproto.server.getServiceAuth(
    { aud, lxm },
    opts ? { signal: opts.signal } : undefined,
  )
  return data.token
}
