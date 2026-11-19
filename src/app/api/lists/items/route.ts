import type { NextRequest } from "next/server";

import { getList, getListItems } from "@/lib/hypercerts/queries";
import { isAtUri } from "@/lib/validate";

// Later pages of a list's items, for "Load more". Public data, so the CDN may
// cache each page briefly.
const cacheHeaders = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const uri = params.get("list") ?? "";
  const offset = Number(params.get("cursor") ?? "0");
  if (!isAtUri(uri) || !uri.includes("/org.hypercerts.collection/")) {
    return Response.json({ error: "InvalidList" }, { status: 400 });
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return Response.json({ error: "InvalidCursor" }, { status: 400 });
  }
  const [, , did, , rkey] = uri.split("/");
  const list = await getList(did, rkey);
  if (!list) return Response.json({ error: "ListNotFound" }, { status: 404 });
  return Response.json(await getListItems(list, offset), { headers: cacheHeaders });
}
