import type { NextRequest } from "next/server";

import { getBadge, listBadgeHolders } from "@/lib/hypercerts/queries";
import { cursorParam, isAtUri } from "@/lib/validate";

// Later pages of a badge's holders, for "Load more" on its page. Public data,
// so the CDN may cache each page briefly.
const cacheHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const uri = params.get("badge") ?? "";
  const response = params.get("response");
  if (!isAtUri(uri) || !uri.includes("/app.certified.badge.definition/")) {
    return Response.json({ error: "InvalidBadge" }, { status: 400 });
  }
  if (response !== "accepted" && response !== "unanswered") {
    return Response.json({ error: "InvalidResponse" }, { status: 400 });
  }
  // The definition says who may issue it: the same filter as the page's.
  const badge = await getBadge(uri);
  if (!badge) return Response.json({ error: "BadgeNotFound" }, { status: 404 });
  const page = await listBadgeHolders(
    uri,
    response,
    badge.allowedIssuers,
    cursorParam(params.get("cursor")),
  );
  return Response.json(page, { headers: cacheHeaders });
}
