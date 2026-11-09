import { getIndexedProfile } from "@/lib/hypercerts/queries";
import { isDid } from "@/lib/validate";

// The indexed version of a profile, for the write overlay's confirmation
// checks. Never cached: a cached answer could not show that indexing caught up.
export async function GET(_request: Request, { params }: RouteContext<"/api/profiles/[did]">) {
  const { did } = await params;
  if (!isDid(did)) return Response.json({ error: "InvalidDid" }, { status: 400 });
  return Response.json(await getIndexedProfile(did), {
    headers: { "Cache-Control": "no-store" },
  });
}
