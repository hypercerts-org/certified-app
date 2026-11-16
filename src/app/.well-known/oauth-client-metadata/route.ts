import { connection } from "next/server";
import { HANDLE_LOGIN_PATH, oauthMode } from "@/lib/auth/config";
import { getOAuthClient } from "@/lib/auth/oauth-client";

// The OAuth client metadata, fetched by authorization servers. Its URL is the
// client_id. Loopback clients in local development publish none, so Certified's
// extensions below only take effect on a deployment.
export async function GET() {
  // Built from runtime env, never prerendered at build time.
  await connection();
  const mode = oauthMode();
  if (mode.kind !== "web") return new Response("Not found", { status: 404 });
  const client = await getOAuthClient();
  return Response.json(
    {
      ...client.clientMetadata,
      // Extensions read by Certified's PDS (ePDS) for its sign-in page:
      // "Sign in with Atmosphere" hands a handle on another server back here,
      // and "Sign in with Google" is offered when its operator enables it.
      epds_handle_login_url: `${mode.publicUrl}${HANDLE_LOGIN_PATH}`,
      epds_social_providers: ["google"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
