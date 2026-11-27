import type { NextRequest } from "next/server";
import { apiUnavailable, PUBLIC_CACHE_HEADERS } from "@/lib/api-response";
import { exploreFrom, explorePage } from "@/lib/explore";
import { cursorParam } from "@/lib/validate";

// Later pages of Explore's lists, for "Load more". Public data, so the CDN may
// cache each page briefly.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  if (kind !== "activities" && kind !== "projects" && kind !== "accounts") {
    return Response.json({ error: "InvalidKind" }, { status: 400 });
  }
  try {
    const state = exploreFrom(Object.fromEntries(params));
    const page = await explorePage(kind, state, cursorParam(params.get("cursor")));
    return Response.json(page, { headers: PUBLIC_CACHE_HEADERS });
  } catch (err) {
    return apiUnavailable("[api/explore] GET /api/explore failed", err, { context: { kind } });
  }
}
