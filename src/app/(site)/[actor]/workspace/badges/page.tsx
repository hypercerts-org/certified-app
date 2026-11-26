import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { ReceivedBadges } from "@/components/workspace-badges";
import { getBadges, getRejectedBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Badges received", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const [{ awaiting, accepted }, rejected] = await Promise.all([
    getBadges(did),
    getRejectedBadges(did),
  ]);
  return <ReceivedBadges repo={did} badges={[...awaiting, ...accepted, ...rejected]} />;
}

/** Badges awarded to the workspace's account: awaiting its response first. */
export default function Page({ params }: PageProps<"/[actor]/workspace/badges">) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
