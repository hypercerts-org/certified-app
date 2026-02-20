import { BrowserOAuthClient } from "@atproto/oauth-client-browser"

const PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network"

let clientInstance: BrowserOAuthClient | null = null

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  )
}

export function getOAuthClient(): BrowserOAuthClient {
  if (clientInstance) return clientInstance

  if (typeof window === "undefined") {
    throw new Error("BrowserOAuthClient can only be used in the browser")
  }

  const hostname = window.location.hostname

  if (isLoopback(hostname)) {
    // Development: let BrowserOAuthClient auto-generate loopback client metadata
    clientInstance = new BrowserOAuthClient({
      handleResolver: PDS_URL,
    })
  } else {
    // Production: use discoverable client metadata served at /.well-known/oauth-client-metadata
    const origin = window.location.origin
    const clientId = `${origin}/.well-known/oauth-client-metadata`

    clientInstance = new BrowserOAuthClient({
      handleResolver: PDS_URL,
      clientMetadata: {
        client_id: clientId,
        client_name: "Certified",
        client_uri: origin,
        logo_uri: `${origin}/assets/certified_brandmark.svg`,
        redirect_uris: [`${origin}/oauth/callback`],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        scope: "atproto transition:generic",
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      },
    })
  }

  return clientInstance
}
