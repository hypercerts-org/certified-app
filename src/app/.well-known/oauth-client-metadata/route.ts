import { connection } from "next/server";
import { oauthMode } from "@/lib/auth/config";
import { getOAuthClient } from "@/lib/auth/oauth-client";

// The OAuth client metadata, fetched by authorization servers. Its URL is the
// client_id. Loopback clients in local development publish none.
export async function GET() {
  // Built from runtime env, never prerendered at build time.
  await connection();
  if (oauthMode().kind !== "web") return new Response("Not found", { status: 404 });
  const client = await getOAuthClient();
  return Response.json(client.clientMetadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
