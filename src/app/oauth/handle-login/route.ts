import { l } from "@atproto/lex";
import { redirect } from "next/navigation";
import { connection, type NextRequest, NextResponse } from "next/server";
import { pendingReturnTo } from "@/lib/auth/sign-in-state";
import { signInErrorHref, signInUrl } from "@/lib/auth/start-sign-in";

// Certified's sign-in page hands a sign-in over here when someone chooses
// "Sign in with Atmosphere" and types a handle on another server (named in the
// client metadata as epds_handle_login_url). The sign-in then starts at that
// handle's own server.
//
// Not straight from the GET: anyone can link here with any handle, and an
// attacker's server can approve a sign-in without asking, which would sign
// the visitor in to the attacker's account (login CSRF). So the GET asks
// first (/sign-in?handle=…), and only the POST from that page, from this
// site, starts the sign-in.

function handleOf(value: unknown): string | null {
  const handle = typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
  return l.isHandleString(handle) ? handle : null;
}

export async function GET(request: NextRequest) {
  await connection();
  const returnTo = await pendingReturnTo();
  const handle = handleOf(request.nextUrl.searchParams.get("handle"));
  if (!handle) redirect(signInErrorHref("handle", returnTo));
  const confirm = new URLSearchParams({ handle, returnTo });
  redirect(`/sign-in?${confirm}`);
}

/** Whether the request comes from a page of this site, not a form elsewhere. */
function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  await connection();
  const returnTo = await pendingReturnTo();
  if (!sameOrigin(request)) redirect(signInErrorHref("failed", returnTo));
  const form = await request.formData().catch(() => null);
  const handle = handleOf(form?.get("handle"));
  if (!handle) redirect(signInErrorHref("handle", returnTo));
  const url = await signInUrl({ handle }, returnTo);
  // 303: the browser follows with a GET. A 307 would repeat the POST.
  return NextResponse.redirect(new URL(url, request.url), 303);
}
