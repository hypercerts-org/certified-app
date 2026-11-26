import { connection, type NextRequest } from "next/server";
import { getActingAs } from "@/lib/acting-as";
import { getUser, SessionUnavailableError } from "@/lib/auth/dal";
import {
  DEFAULT_ORG_QUALITY,
  FEED_EVENT_KINDS,
  type FeedEventKind,
  ORG_QUALITY_TIERS,
  type OrgQualityTier,
} from "@/lib/feed-grouping";
import { logError } from "@/lib/log";
import { isDid } from "@/lib/validate";
import { FeedServiceError, getNetworkFeed, getTrustedEvaluators } from "@/lib/views-service";

const VALID_KINDS = new Set<string>(FEED_EVENT_KINDS);
const VALID_ORG_TIERS = new Set<string>(ORG_QUALITY_TIERS);

const privateHeaders = { "Cache-Control": "private, no-store" };

/**
 * Signed-in network feed pages for pagination and live filter updates.
 * Derives `viewerDid` from the active `actingAs` identity server-side so
 * personal accounts and groups each load their own follow graph safely.
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: "SignedOut" }, { status: 401, headers: privateHeaders });
    }
    const viewerDid = (await getActingAs()) ?? user.did;
    const params = request.nextUrl.searchParams;

    const cursor = params.get("cursor");
    if (cursor !== null && (cursor.length > 4096 || !/^[\w-]*$/.test(cursor))) {
      return Response.json({ error: "InvalidCursor" }, { status: 400, headers: privateHeaders });
    }

    // Evaluators: omitted → the curated defaults, less any in `excludeEvaluators`
    // (what the feed page sends: the ones the viewer turned off); `none` → no
    // expansion; else comma-separated DIDs.
    const rawEvaluators = params.get("evaluators");
    let trustedEvaluators: string[];
    if (rawEvaluators === null) {
      const excluded = (params.get("excludeEvaluators") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (excluded.length > 128 || excluded.some((did) => !isDid(did))) {
        return Response.json(
          { error: "InvalidEvaluators" },
          { status: 400, headers: privateHeaders },
        );
      }
      const off = new Set(excluded);
      trustedEvaluators = (await getTrustedEvaluators())
        .map((e) => e.did)
        .filter((did) => !off.has(did));
    } else if (rawEvaluators === "" || rawEvaluators === "none") {
      trustedEvaluators = [];
    } else {
      const parsed = rawEvaluators
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length > 128 || parsed.some((did) => !isDid(did))) {
        return Response.json(
          { error: "InvalidEvaluators" },
          { status: 400, headers: privateHeaders },
        );
      }
      trustedEvaluators = [...new Set(parsed)];
    }

    // Organization quality filter
    const rawQuality = params.get("orgQuality");
    let allowed: OrgQualityTier[];
    if (rawQuality === null) {
      allowed = [...DEFAULT_ORG_QUALITY.allowed];
    } else if (rawQuality === "" || rawQuality === "none") {
      allowed = [];
    } else {
      const parsed = rawQuality
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.some((tier) => !VALID_ORG_TIERS.has(tier))) {
        return Response.json(
          { error: "InvalidOrgQuality" },
          { status: 400, headers: privateHeaders },
        );
      }
      allowed = [...new Set(parsed)] as OrgQualityTier[];
    }

    const rawUnrated = params.get("includeUnrated");
    const includeUnrated =
      rawUnrated === null ? DEFAULT_ORG_QUALITY.includeUnrated : rawUnrated !== "false";

    // Event kinds filter
    const rawKinds = params.get("kinds");
    let kinds: FeedEventKind[] | undefined;
    if (rawKinds) {
      const parsed = rawKinds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.some((k) => !VALID_KINDS.has(k))) {
        return Response.json({ error: "InvalidKinds" }, { status: 400, headers: privateHeaders });
      }
      kinds = [...new Set(parsed)] as FeedEventKind[];
    }

    const page = await getNetworkFeed({
      viewerDid,
      trustedEvaluators,
      organizationQuality: { allowed, includeUnrated },
      kinds,
      cursor: cursor || undefined,
    });
    return Response.json(page, { headers: privateHeaders });
  } catch (err) {
    if (err instanceof FeedServiceError && err.status >= 400 && err.status < 500) {
      return Response.json(
        { error: err.code ?? "InvalidRequest", message: err.message },
        { status: err.status, headers: privateHeaders },
      );
    }
    if (!(err instanceof SessionUnavailableError)) {
      logError("[api/feed] feed load failed", err);
    }
    return Response.json({ error: "Unavailable" }, { status: 503, headers: privateHeaders });
  }
}
