import { connection } from "next/server";
import { SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";
import { toOrganizations } from "@/lib/organizations";

// The signed-in user's organizations, for the account menu's "Act as" list:
// the memberships for display (memberships.ts: Valkey, no OAuth restore on a
// hit), with names and avatars from the index.

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  // Per user: never prerendered.
  await connection();
  try {
    const memberships = await getMemberships();
    if (memberships === null || memberships === "expired") {
      return Response.json({ error: "SignedOut" }, { status: 401, headers: privateHeaders });
    }
    return Response.json(
      { organizations: await toOrganizations(memberships) },
      { headers: privateHeaders },
    );
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[cgs] organizations failed", err);
    return Response.json({ error: "Unavailable" }, { status: 503, headers: privateHeaders });
  }
}
