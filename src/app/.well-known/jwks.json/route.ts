import { connection } from "next/server";
import { getOAuthClient } from "@/lib/auth/oauth-client";

// Public keys of a confidential OAuth client (OAUTH_PRIVATE_KEY set).
export async function GET() {
  await connection();
  const client = await getOAuthClient();
  if (client.clientMetadata.token_endpoint_auth_method !== "private_key_jwt") {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(client.jwks, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
