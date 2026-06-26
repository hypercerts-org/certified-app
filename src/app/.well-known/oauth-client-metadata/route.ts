import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export async function GET() {
  const client = await getOAuthClient()

  // Derive origin from client_id (strip the path)
  const origin = new URL(client.clientMetadata.client_id).origin

  // Build metadata as a plain object to avoid strict type constraints
  const metadata: Record<string, unknown> = {
    ...client.clientMetadata,
    // Add the extra fields that the ePDS needs but are not part of the OAuth client config
    brand_color: "#111111",
    background_color: "#f9f9f9",
    tos_uri: `${origin}/terms`,
    policy_uri: `${origin}/privacy`,
    email_template_uri: `${origin}/email/otp-email-template.html`,
    email_subject_template: "{{code}} — Your Certified sign-in code",
    // ePDS extension: skip the "Authorize your account" consent screen on a
    // user's first-time sign-up so new accounts land straight in the app.
    // Only honoured when the PDS runs with PDS_SIGNUP_ALLOW_CONSENT_SKIP=true
    // and this client_id is on its PDS_OAUTH_TRUSTED_CLIENTS allowlist.
    epds_skip_consent_on_signup: true,
    // Opt in to ePDS's "Or sign in with ATProto/Bluesky" button. ePDS
    // redirects here with ?handle=<value>; the GET handler in
    // src/app/api/auth/login/route.ts resolves the handle to its PDS
    // and starts a fresh OAuth flow.
    epds_handle_login_url: `${origin}/api/auth/login`,
  }

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
