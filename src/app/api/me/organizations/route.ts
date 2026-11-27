import { connection } from "next/server";
import { apiUnavailable, PRIVATE_NO_STORE_HEADERS } from "@/lib/api-response";
import { getMemberships } from "@/lib/memberships";
import { toOrganizations } from "@/lib/organizations";

// The signed-in user's organizations, for the account menu's "Act as" list:
// the memberships for display (memberships.ts: Valkey, no OAuth restore on a
// hit), with names and avatars from the index.
export async function GET() {
  // Per user: never prerendered.
  await connection();
  try {
    const memberships = await getMemberships();
    if (memberships === null || memberships === "expired") {
      return Response.json(
        { error: "SignedOut" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      { organizations: await toOrganizations(memberships) },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (err) {
    return apiUnavailable("[cgs] organizations failed", err);
  }
}
