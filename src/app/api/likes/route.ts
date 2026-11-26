import { connection, NextResponse } from "next/server";
import { getActingAs } from "@/lib/acting-as";
import { SessionUnavailableError } from "@/lib/auth/dal";
import { getActorLikesForSubjects, getLikeCounts } from "@/lib/hypercerts/queries";
import { logError } from "@/lib/log";
import { isAtUri } from "@/lib/validate";

const MAX_SUBJECTS = 50;
const privateHeaders = { "Cache-Control": "private, no-store" };

/**
 * GET /api/likes?subjects=at://...&subjects=at://...
 *
 * Returns batched like counts and (when signed in) the acting account's like
 * URI for each requested subject AT-URI. Keeps public timelines statically
 * cached while letting client timelines hydrate likes in one request.
 */
export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const raw = searchParams.getAll("subjects");
  const subjects = [...new Set(raw.flatMap((v) => v.split(",")).map((s) => s.trim()))]
    .filter((s) => isAtUri(s))
    .slice(0, MAX_SUBJECTS)
    .sort();

  try {
    const actor = await getActingAs();
    if (subjects.length === 0) {
      return NextResponse.json({ actor, likes: {} }, { headers: privateHeaders });
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

    return NextResponse.json({ actor, likes }, { headers: privateHeaders });
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) {
      logError("[likes] GET /api/likes failed", err, { count: subjects.length });
    }
    return NextResponse.json(
      { error: "LikesUnavailable" },
      { status: 503, headers: privateHeaders },
    );
  }
}
