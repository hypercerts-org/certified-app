import { l } from "@atproto/lex";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { pendingReturnTo } from "@/lib/auth/sign-in-state";
import { signInErrorHref, signInUrl } from "@/lib/auth/start-sign-in";

// Certified's sign-in page hands a sign-in over here when someone chooses
// "Sign in with Atmosphere" and types a handle on another server (named in the
// client metadata as epds_handle_login_url). Start a fresh sign-in at that
// handle's server, returning where the first one would have.
//
// Only ever reached through that hand-off, never through a link on this site:
// a prefetch must not start a sign-in. A forged link can only start a sign-in
// to an account at its own server, which the visitor would have to sign in to.
export async function GET(request: NextRequest) {
  await connection();
  const returnTo = await pendingReturnTo();
  const handle = request.nextUrl.searchParams.get("handle")?.trim().replace(/^@/, "").toLowerCase();
  if (!handle || !l.isHandleString(handle)) redirect(signInErrorHref("handle", returnTo));
  redirect(await signInUrl({ handle }, returnTo));
}
