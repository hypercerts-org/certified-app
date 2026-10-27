import { NextResponse } from "next/server"
import {
  INVALID_KEY_MESSAGE,
  getCreatedViaDidDocument,
  getCreatedViaSigner,
} from "@/lib/atproto/created-via"

// Reads the signing env at request time; a build-time 404 must never be baked in.
export const dynamic = "force-dynamic"

/**
 * did:web document for the app's record-signing key (`#createdVia`
 * signatures). 404 while signing is disabled, 500 when the configured key is
 * malformed. Only the 200 is cacheable, so a cached 404 can't outlive the key
 * being set. Every key that ever signed must stay published here for as long
 * as its records exist — see AGENTS.md "Record signing (createdVia)".
 */
export async function GET() {
  const signer = await getCreatedViaSigner()
  if (signer.status === "invalid") console.error(INVALID_KEY_MESSAGE)
  if (signer.status === "ready") {
    return NextResponse.json(getCreatedViaDidDocument(signer), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    })
  }
  return NextResponse.json(
    { error: signer.status === "invalid" ? "Signing key misconfigured" : "Not found" },
    {
      status: signer.status === "invalid" ? 500 : 404,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
