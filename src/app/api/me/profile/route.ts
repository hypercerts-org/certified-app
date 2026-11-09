import type { NextRequest } from "next/server";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import type { ProfileVersion } from "@/lib/hypercerts/views";
import { getOwnProfile, profileFields } from "@/lib/hypercerts/writes";

// The signed-in user's profile as their PDS has it: the authoritative version
// the write overlay checks when a save's outcome is unknown, or when the index
// shows a version other than the one saved. `did` names the account the
// browser's local state belongs to; another signed-in account gets 409, so one
// account's profile never settles another's saves.
export async function GET(request: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  try {
    const session = await getOAuthSession();
    if (!session) return Response.json({ error: "SignedOut" }, { status: 401, headers: noStore });
    if (request.nextUrl.searchParams.get("did") !== session.did) {
      return Response.json({ error: "AccountMismatch" }, { status: 409, headers: noStore });
    }
    const { cid, value } = await getOwnProfile(session);
    const version: ProfileVersion | null = cid
      ? {
          uri: `at://${session.did}/app.certified.actor.profile/self`,
          cid,
          ...profileFields(value),
        }
      : null;
    return Response.json(version, { headers: noStore });
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) throw err;
    return Response.json(
      { error: "Unavailable" },
      { status: 503, headers: { ...noStore, "Retry-After": "5" } },
    );
  }
}
