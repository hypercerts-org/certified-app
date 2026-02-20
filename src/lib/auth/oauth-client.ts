import { BrowserOAuthClient } from "@atproto/oauth-client-browser"

const PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network"

let clientInstance: BrowserOAuthClient | null = null

export function getOAuthClient(): BrowserOAuthClient {
  if (clientInstance) return clientInstance
  clientInstance = new BrowserOAuthClient({
    handleResolver: PDS_URL,
    // responseMode defaults to "fragment" for browser clients
  })
  return clientInstance
}
