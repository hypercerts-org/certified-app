import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { getOwnProfile, profileFields } from "@/lib/hypercerts/writes";
import type { ProfileVersion } from "@/lib/hypercerts/views";

// The signed-in user's profile as their PDS has it: the authoritative version
// the write overlay checks when a save's outcome is unknown, or when the index
// later shows a version other than the one saved.
export async function GET() {
  const noStore = { "Cache-Control": "no-store" };
  try {
    const session = await getOAuthSession();
    if (!session) return Response.json({ error: "SignedOut" }, { status: 401, headers: noStore });
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
