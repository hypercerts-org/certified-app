import { connection, type NextRequest } from "next/server";
import { getActingAs } from "@/lib/acting-as";
import { apiUnavailable, PRIVATE_NO_STORE_HEADERS } from "@/lib/api-response";
import { getActorLikesForSubjects, getLikeCounts } from "@/lib/hypercerts/queries";
import { isAtUri } from "@/lib/validate";

const MAX_SUBJECTS = 50;

/**
 * GET /api/likes?subjects=at://...&subjects=at://...
 *
 * Returns batched like counts and (when signed in) the acting account's like
 * URI for each requested subject AT-URI. Keeps public timelines statically
 * cached while letting client timelines hydrate likes in one request.
 */
export async function GET(request: NextRequest) {
  await connection();
  const raw = request.nextUrl.searchParams.getAll("subjects");
  const subjects = [...new Set(raw.flatMap((v) => v.split(",")).map((s) => s.trim()))]
    .filter((s) => isAtUri(s))
    .slice(0, MAX_SUBJECTS)
    .sort();

  try {
    const actor = await getActingAs();
    if (subjects.length === 0) {
      return Response.json({ actor, likes: {} }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const [counts, actorLikes] = await Promise.all([
      getLikeCounts(subjects),
      actor
        ? getActorLikesForSubjects(actor, subjects)
        : Promise.resolve({} as Record<string, string | null>),
    ]);

    const likes: Record<string, { count: number; likeUri: string | null }> = {};
    for (const subject of subjects) {
      likes[subject] = {
        count: counts[subject] ?? 0,
        likeUri: actorLikes[subject] ?? null,
      };
    }

    return Response.json({ actor, likes }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (err) {
    return apiUnavailable("[likes] GET /api/likes failed", err, {
      error: "LikesUnavailable",
      context: { count: subjects.length },
    });
  }
}
