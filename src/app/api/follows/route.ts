import { getIndexedFollow } from "@/lib/hypercerts/queries";
import { isDid } from "@/lib/validate";

// The index's follow of `subject` by `actor`, for the write overlay's
// confirmation checks. Never cached: a cached answer could not show that
// indexing caught up.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const actor = params.get("actor") ?? "";
  const subject = params.get("subject") ?? "";
  if (!isDid(actor) || !isDid(subject))
    return Response.json({ error: "InvalidDid" }, { status: 400 });
  return Response.json(await getIndexedFollow(actor, subject), {
    headers: { "Cache-Control": "no-store" },
  });
}
