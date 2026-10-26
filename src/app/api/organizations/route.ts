import type { NextRequest } from "next/server"

import { listOrganizationsPage } from "@/lib/hypercerts/queries"
import { cursorParam } from "@/lib/validate"

const cacheHeaders = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get("q")?.trim().slice(0, 100) || undefined
  const page = await listOrganizationsPage({ query, cursor: cursorParam(params.get("cursor")) })
  return Response.json(page, { headers: cacheHeaders })
}
