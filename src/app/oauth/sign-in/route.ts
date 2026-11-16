import { connection, type NextRequest, NextResponse } from "next/server";
import { CERTIFIED_PDS_URL } from "@/lib/auth/config";
import { signInUrl } from "@/lib/auth/start-sign-in";
import { returnPath } from "@/lib/validate";

// The Sign in buttons are plain HTML forms that post here: the browser leaves
// for Certified's sign-in page like after any form, with no waiting state to
// flicker. Its page offers an email code, Google, or a handle on any AT
// Protocol server; a browser already signed in there comes straight back.
//
// A POST, so no prefetch can start a sign-in. A forged form from another site
// can only start a sign-in the visitor would still have to complete, bound to
// their own browser by the sign-in cookie.
export async function POST(request: NextRequest) {
  await connection();
  const form = await request.formData().catch(() => null);
  const returnTo = returnPath(form?.get("returnTo"));
  const url = await signInUrl({ server: CERTIFIED_PDS_URL }, returnTo);
  // 303: the browser follows with a GET. A 307 would repeat the POST.
  return NextResponse.redirect(new URL(url, request.url), 303);
}
