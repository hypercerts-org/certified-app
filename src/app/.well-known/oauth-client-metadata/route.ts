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
    email_template_uri: `${origin}/assets/otp-email-template.html`,
    email_subject_template: "{{code}} — Your Certified sign-in code",
  }

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
