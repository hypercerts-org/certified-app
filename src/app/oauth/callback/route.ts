import { OAuthCallbackError } from "@atproto/oauth-client-node";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth/oauth-client";
import { createAppSession, endAppSession } from "@/lib/auth/session";
import { completeSignIn, returnPathFromState } from "@/lib/auth/sign-in-state";
import { logError } from "@/lib/log";

function backToSignIn(reason: "denied" | "failed", returnTo: string): never {
  redirect(`/sign-in?error=${reason}&returnTo=${encodeURIComponent(returnTo)}`);
}

// The authorization server redirects here after sign-in. Exchange the code,
// check that this browser started the sign-in, start a new app session and
// send the user back where they started.
export async function GET(request: NextRequest) {
  // Without it the build prerenders this handler and runs the exchange.
  await connection();
  let did: string;
  let state: string | null;
  try {
    const { session, state: appState } = await (await getOAuthClient()).callback(
      request.nextUrl.searchParams,
    );
    did = session.did;
    state = appState;
  } catch (err) {
    const denied = err instanceof OAuthCallbackError && err.params.get("error") === "access_denied";
    if (!denied) logError("[auth] callback failed", err);
    backToSignIn(
      denied ? "denied" : "failed",
      err instanceof OAuthCallbackError ? returnPathFromState(err.state) : "/",
    );
  }

  const returnTo = await completeSignIn(state);
  if (!returnTo) {
    logError("[auth] callback not started in this browser", null, { did });
    backToSignIn("failed", "/");
  }
  // Never reuse a session id from before sign-in (session fixation). Other
  // browsers on this account keep their sessions.
  await endAppSession({ revokeIfLast: false });
  await createAppSession(did);
  redirect(returnTo);
}
