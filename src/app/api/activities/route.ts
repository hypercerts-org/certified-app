import type { NextRequest } from "next/server";

import { listActivitiesPage, listProjectActivitiesPage } from "@/lib/hypercerts/queries";
import { cursorParam, isAtUri, isDid } from "@/lib/validate";

// Later pages of an activity list, for "load more" on the site and in embeds.
// Public data, so the CDN may cache each page briefly.
const cacheHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cursor = cursorParam(params.get("cursor"));
  const author = params.get("author");
  const project = params.get("project");

  if (project !== null) {
    if (!isAtUri(project)) return Response.json({ error: "InvalidProject" }, { status: 400 });
    return Response.json(await listProjectActivitiesPage({ project, cursor }), {
      headers: cacheHeaders,
    });
  }
  if (author === null || !isDid(author)) {
    return Response.json({ error: "InvalidAuthor" }, { status: 400 });
  }
  return Response.json(await listActivitiesPage({ author, cursor, limit: 6 }), {
    headers: cacheHeaders,
  });
}
