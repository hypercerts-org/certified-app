import { NextResponse } from "next/server"
import { getOAuthClient } from "@/lib/auth/oauth-client"

export async function GET() {
  const client = await getOAuthClient()

  // Start with the client metadata from the OAuth client
  const metadata = {
    ...client.clientMetadata,
    // Add the extra fields that the ePDS needs but are not part of the OAuth client config
    brand_color: "#60A1E2",
    background_color: "#0F2544",
  }

  // Derive origin from client_id (strip the path)
  const origin = new URL(client.clientMetadata.client_id).origin
  metadata.tos_uri = `${origin}/terms`
  metadata.policy_uri = `${origin}/privacy`
  metadata.email_template_uri = `${origin}/assets/otp-email-template.html`
  metadata.email_subject_template = "{{code}} — Your Certified sign-in code"

  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  })
}
