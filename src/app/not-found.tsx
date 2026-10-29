import { headers } from "next/headers";
import { FileQuestion, UserX } from "lucide-react";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import NotFoundMarker from "@/components/layout/not-found-marker";
import { resolveHandle } from "@/lib/atproto/did";
import { lookupActor, lookupRecord } from "@/lib/og-metadata";
import {
  collectionForType,
  isRecordType,
  parseActor,
  profileUrl,
  RESERVED_ROUTES,
  type RecordType,
} from "@/lib/urls";

// Note: Next.js does not support metadata exports in not-found.tsx. The
// profile and record variants render their own <title> (React hoists it
// into <head>); on other paths the root default title already comes first.
// 404 pages are not indexed by search engines by default.

type Missing =
  | { kind: "profile"; actor: string }
  | { kind: "record"; actor: string; type: RecordType }
  | null;

/**
 * What a not-found path was looking for. `/{actor}` catches every unknown
 * top-level path and only 404s for an actor that doesn't exist, so it's a
 * missing profile. Deeper paths say "profile" or "record" only when that
 * absence is established (the same per-request lookups the [actor] layouts
 * ran, src/lib/og-metadata.ts); a typo under a real profile stays generic.
 */
async function whatIsMissing(pathname: string | null): Promise<Missing> {
  const segments = (pathname ?? "").split("/").filter(Boolean).map(safeDecode);
  if (segments.length === 0 || RESERVED_ROUTES.has(segments[0])) return null;
  const actor = parseActor(segments[0]);
  if (segments.length === 1) return { kind: "profile", actor: actor.value };
  if (actor.kind === "invalid") return null;

  const resolved = await lookupActor(segments[0]);
  if (resolved.status === "missing") return { kind: "profile", actor: actor.value };
  if (resolved.status !== "found") return null;

  // `/{actor}/{type}/{rkey}` and its edit / update children.
  const [, type, rkey] = segments;
  if (segments.length >= 3 && isRecordType(type) && rkey) {
    const record = await lookupRecord(resolved.did, collectionForType(type), rkey);
    if (record === "missing") {
      // A DID-addressed link still names the profile by its handle.
      const handle =
        resolved.handle ?? (await resolveHandle(resolved.did).catch(() => null));
      return { kind: "record", actor: handle ?? actor.value, type };
    }
  }
  return null;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const RECORD_LABEL: Record<RecordType, string> = {
  activity: "Activity",
  project: "Project",
};

// Paths no route matches (`/{handle}/typo`) haven't run these lookups yet;
// past this the page says the generic thing rather than keep a 404 waiting.
const LOOKUP_BUDGET_MS = 3_000;

async function withinBudget<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), LOOKUP_BUDGET_MS);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
}

export default async function NotFoundPage() {
  // Set by src/proxy.ts; the not-found page can't see route params.
  const pathname = (await headers()).get("x-pathname");
  const missing = await withinBudget(whatIsMissing(pathname), null);

  // Hides the pathname-derived profile tabs in the top bar.
  const marker = <NotFoundMarker />;

  if (missing?.kind === "profile") {
    return (
      <>
        {marker}
        <title>Profile not found — Certified</title>
        <EmptyState
          icon={UserX}
          title="Profile not found"
          description={`We couldn't find a Certified profile for @${missing.actor}.`}
          headingLevel={1}
          className="pt-[120px]"
        >
          <Button variant="secondary" size="sm" href="/explore">
            Explore profiles
          </Button>
        </EmptyState>
      </>
    );
  }

  if (missing?.kind === "record") {
    const label = RECORD_LABEL[missing.type];
    return (
      <>
        {marker}
        <title>{`${label} not found — Certified`}</title>
        <EmptyState
          icon={FileQuestion}
          title={`${label} not found`}
          description={`This ${label.toLowerCase()} doesn't exist or was deleted.`}
          headingLevel={1}
          className="pt-[120px]"
        >
          <Button variant="secondary" size="sm" href={profileUrl(missing.actor)}>
            {`View @${missing.actor}`}
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {marker}
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist."
        headingLevel={1}
      >
        <Button variant="secondary" size="sm" href="/">
          Go home
        </Button>
      </EmptyState>
    </>
  );
}
