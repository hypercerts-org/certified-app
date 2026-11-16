import { connection } from "next/server";
import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";
import { listOrganizations } from "@/lib/organizations";

// The signed-in user's organizations, for the workspace switcher. Loaded when
// the switcher opens, not on every page: each call asks the user's PDS for a
// service-auth token and then the Certified Group Service.

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  // Per user: never prerendered.
  await connection();
  try {
    const session = await getOAuthSession();
    if (!session) {
      return Response.json({ error: "SignedOut" }, { status: 401, headers: privateHeaders });
    }
    return Response.json(
      { organizations: await listOrganizations(session) },
      { headers: privateHeaders },
    );
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[cgs] organizations failed", err);
    return Response.json({ error: "Unavailable" }, { status: 503, headers: privateHeaders });
  }
}
