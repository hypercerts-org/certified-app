import { headers } from "next/headers";
import { UserX } from "lucide-react";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { parseActor, RESERVED_ROUTES } from "@/lib/urls";

// Note: Next.js does not support metadata exports in not-found.tsx, so the
// title is rendered here (React hoists <title> into <head>).
// 404 pages are not indexed by search engines by default.

/** The actor a not-found path was looking for, if it's a profile route:
 *  `/{actor}` catches every unknown top-level path, and the [actor] layout
 *  calls notFound() for actors that don't exist (src/lib/og-metadata.ts). */
function missingActor(pathname: string | null): string | null {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  if (segments.length === 0 || RESERVED_ROUTES.has(segments[0])) return null;
  const actor = parseActor(segments[0]);
  if (actor.kind !== "invalid" || segments.length === 1) return actor.value;
  return null;
}

export default async function NotFoundPage() {
  // Set by src/proxy.ts; the not-found page can't see route params.
  const actor = missingActor((await headers()).get("x-pathname"));

  if (actor) {
    return (
      <>
        <title>Profile not found — Certified</title>
        <EmptyState
          icon={UserX}
          title="Profile not found"
          description={`We couldn't find a Certified profile for @${actor}.`}
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

  return (
    <>
      <title>Page not found — Certified</title>
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
