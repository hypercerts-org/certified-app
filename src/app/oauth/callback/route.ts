import { OAuthCallbackError } from "@atproto/oauth-client-node";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth/oauth-client";
import { createAppSession, destroyAppSession } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { returnPath } from "@/lib/validate";

// The authorization server redirects here after sign-in. Exchange the code,
// start a new app session and send the user back where they started.
export async function GET(request: NextRequest) {
  await connection();
  let did: string;
  let returnTo: string;
  try {
    const client = await getOAuthClient();
    const { session, state } = await client.callback(request.nextUrl.searchParams);
    did = session.did;
    returnTo = returnPath(state);
  } catch (err) {
    const denied = err instanceof OAuthCallbackError && err.params.get("error") === "access_denied";
    if (!denied) logError("[auth] callback failed", err);
    const back = err instanceof OAuthCallbackError ? returnPath(err.state) : "/";
    redirect(`/sign-in?error=${denied ? "denied" : "failed"}&returnTo=${encodeURIComponent(back)}`);
  }

  // Never reuse a session id from before sign-in (session fixation).
  await destroyAppSession({ clearCookie: false });
  await createAppSession(did);
  redirect(returnTo);
}
