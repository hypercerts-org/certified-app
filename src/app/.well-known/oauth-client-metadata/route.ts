import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export async function GET() {
  const client = await getOAuthClient()

  // Derive origin from client_id (strip the path)
  const origin = new URL(client.clientMetadata.client_id).origin

  // Build metadata as a plain object to avoid strict type constraints.
  //
  // The ePDS renders the OTP / sign-in screen using these three fields from
  // OAuth client metadata (see hypercerts-org/ePDS
  // packages/auth-service/src/routes/login-page.ts → renderLoginPage):
  //
  //   background_color → body background (full page)
  //   brand_color      → primary button bg + input focus border
  //   logo_uri         → centered logo at the top of the card
  //
  // The ePDS login page has NO dark-mode support (the body + container colors
  // are rendered by the server HTML), so we deliberately pin these to our
  // light-mode tokens so every user — regardless of their system preference —
  // sees a light OTP screen that matches the rest of the app's light theme.
  //
  // Values mirror the tokens in src/app/globals.css:
  //   #ffffff  → --bg-elevated (same surface as the sign-in modal card)
  //   #111111  → --fg-primary  / --btn-primary-bg (primary text + button)
  const metadata: Record<string, unknown> = {
    ...client.clientMetadata,
    // Light-mode-only branding for the ePDS OTP screen.
    brand_color: "#111111",
    background_color: "#ffffff",
    tos_uri: `${origin}/terms`,
    policy_uri: `${origin}/privacy`,
    email_template_uri: `${origin}/assets/otp-email-template.html`,
    email_subject_template: "{{code}} — Your Certified sign-in code",
    // Opt in to ePDS's "Or sign in with ATProto/Bluesky" button. ePDS
    // redirects to this URL with ?handle=<value>; the GET handler in
    // src/app/api/auth/login/route.ts resolves the handle to its PDS
    // and starts a fresh OAuth flow.
    epds_handle_login_url: `${origin}/api/auth/login`,
    // Browser-tab icon for trusted-client auth/consent pages (ePDS
    // emits a <link rel="icon"> from this). SVG so it stays crisp at any
    // tab size. No `favicon_url_dark` yet — the current brandmark has no
    // white variant; add one (or an adaptive SVG) to ship a dark-theme
    // tab icon.
    favicon_url: `${origin}/brand/brandmark/certified_brandmark_black.svg`,
  }

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
