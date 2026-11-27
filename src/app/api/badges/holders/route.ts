import type { NextRequest } from "next/server";
import { apiUnavailable, PUBLIC_CACHE_HEADERS } from "@/lib/api-response";
import { getBadge, listBadgeHolders } from "@/lib/hypercerts/queries";
import { cursorParam, isAtUri } from "@/lib/validate";

// Later pages of a badge's holders, for "Load more" on its page. Public data,
// so the CDN may cache each page briefly.
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
  try {
    // The definition says who may issue it: the same filter as the page's.
    const badge = await getBadge(uri);
    if (!badge) return Response.json({ error: "BadgeNotFound" }, { status: 404 });
    const page = await listBadgeHolders(
      uri,
      response,
      badge.allowedIssuers,
      cursorParam(params.get("cursor")),
    );
    return Response.json(page, { headers: PUBLIC_CACHE_HEADERS });
  } catch (err) {
    return apiUnavailable("[api/badges/holders] GET /api/badges/holders failed", err, {
      context: { uri, response },
    });
  }
}
