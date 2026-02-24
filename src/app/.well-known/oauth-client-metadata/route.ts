import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const origin = request.headers.get("x-forwarded-host")
    ? `https://${request.headers.get("x-forwarded-host")}`
    : request.nextUrl.origin

  const clientId = `${origin}/.well-known/oauth-client-metadata`

  const metadata = {
    client_id: clientId,
    client_name: "Certified",
    client_uri: origin,
    logo_uri: `${origin}/assets/certified_brandmark.svg`,
    tos_uri: `${origin}/terms`,
    policy_uri: `${origin}/privacy`,
    redirect_uris: [`${origin}/oauth/callback`],
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    scope: "atproto transition:generic identity:handle account:email",
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
    brand_color: '#60A1E2',
    background_color: '#0F2544',
    email_template_uri: `${origin}/assets/otp-email-template.html`,
    email_subject_template: '{{code}} — Your Certified sign-in code',
  }

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
