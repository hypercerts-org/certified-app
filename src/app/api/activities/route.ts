import type { NextRequest } from "next/server"

import { listActivitiesPage, listProjectActivitiesPage } from "@/lib/hypercerts/queries"
import { cursorParam, isAtUri, isDid } from "@/lib/validate"

// Later pages of an activity list, for "load more" on the site and in embeds.
// Public data, so the CDN may cache each page briefly.
const cacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const cursor = cursorParam(params.get("cursor"))
  const author = params.get("author")
  const project = params.get("project")

  if (author !== null && !isDid(author)) return Response.json({ error: "InvalidAuthor" }, { status: 400 })
  if (project !== null && !isAtUri(project)) return Response.json({ error: "InvalidProject" }, { status: 400 })

  const page = project
    ? await listProjectActivitiesPage({ project, cursor })
    : await listActivitiesPage({ author: author ?? undefined, cursor, limit: author ? 6 : 9 })
  return Response.json(page, { headers: cacheHeaders })
}
