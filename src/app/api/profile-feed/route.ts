import type { NextRequest } from "next/server";

import { getProfileFeed } from "@/lib/hypercerts/queries";
import { isDid } from "@/lib/validate";

// Later pages of a profile's feed, for "Load more". Public data, so the CDN
// may cache each page briefly.
const cacheHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const did = params.get("did");
  const cursor = params.get("cursor");
  if (did === null || !isDid(did)) return Response.json({ error: "InvalidDid" }, { status: 400 });
  // The cursor is the feed's own (where each kind stopped), base64url JSON.
  if (cursor !== null && (cursor.length > 4096 || !/^[\w-]*$/.test(cursor))) {
    return Response.json({ error: "InvalidCursor" }, { status: 400 });
  }
  return Response.json(await getProfileFeed(did, cursor || undefined), { headers: cacheHeaders });
}
