import type { NextRequest } from "next/server";
import { apiUnavailable, PUBLIC_CACHE_HEADERS } from "@/lib/api-response";
import { listActivitiesPage, listProjectActivitiesPage } from "@/lib/hypercerts/queries";
import { cursorParam, isAtUri, isDid } from "@/lib/validate";

// Later pages of an activity list, for "Load more".
// Public data, so the CDN may cache each page briefly.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cursor = cursorParam(params.get("cursor"));
  const author = params.get("author");
  const project = params.get("project");

  try {
    if (project !== null) {
      if (!isAtUri(project)) return Response.json({ error: "InvalidProject" }, { status: 400 });
      return Response.json(await listProjectActivitiesPage({ project, cursor }), {
        headers: PUBLIC_CACHE_HEADERS,
      });
    }
    if (author === null || !isDid(author)) {
      return Response.json({ error: "InvalidAuthor" }, { status: 400 });
    }
    return Response.json(await listActivitiesPage({ author, cursor, limit: 6 }), {
      headers: PUBLIC_CACHE_HEADERS,
    });
  } catch (err) {
    return apiUnavailable("[api/activities] GET /api/activities failed", err, {
      context: { author, project },
    });
  }
}
