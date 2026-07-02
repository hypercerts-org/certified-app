import { redirect } from "next/navigation";
import { getSessionDid } from "@/lib/auth/session";

/**
 * Root — `/`.
 *
 * Signed-in visitors land on `/home` (the activity feed). Signed-out
 * visitors land on `/welcome` (the marketing landing). Applies
 * uniformly across hosts — production (certified.app), redesign
 * (redesign.certified.app), and staging (staging.certified.app) all
 * resolve `/` through this component.
 *
 * A Server Component reads the session cookie directly via
 * `getSessionDid()` — the same source `/api/auth/session` reads — and
 * issues the redirect before any client bundle loads, so there is no
 * spinner, no client round-trip, and crawlers get a real 307 instead of
 * a blank spinner page. Redis session presence is an authoritative-enough
 * signal for which landing to show; `/home` re-verifies the OAuth session
 * and bounces to `/welcome` if it has since been revoked.
 */
export default async function Root() {
  const did = await getSessionDid();
  redirect(did ? "/home" : "/welcome");
}
