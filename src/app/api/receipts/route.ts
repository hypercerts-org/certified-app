import type { NextRequest } from "next/server";
import { apiUnavailable, PUBLIC_CACHE_HEADERS } from "@/lib/api-response";
import { listReceiptsPage, type ReceiptFilter } from "@/lib/hypercerts/queries";
import { cursorParam, isAtUri, isDid } from "@/lib/validate";

// Later pages of a ledger of receipts, for "Load more": to or from an
// account, or for a record. Public data, so the CDN may cache each page.
function filterOf(params: URLSearchParams): ReceiptFilter | null {
  const to = params.get("to");
  if (to) return isDid(to) ? { to } : null;
  const from = params.get("from");
  if (from) return isDid(from) ? { from } : null;
  const by = params.get("by");
  if (by) return isDid(by) ? { by } : null;
  const subject = params.get("for");
  if (subject) return isAtUri(subject) ? { for: subject } : null;
  return null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filter = filterOf(params);
  if (!filter) return Response.json({ error: "InvalidFilter" }, { status: 400 });
  try {
    return Response.json(await listReceiptsPage(filter, cursorParam(params.get("cursor"))), {
      headers: PUBLIC_CACHE_HEADERS,
    });
  } catch (err) {
    return apiUnavailable("[api/receipts] GET /api/receipts failed", err);
  }
}
