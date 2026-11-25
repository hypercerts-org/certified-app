import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { ReceivedBadges } from "@/components/workspace-badges";
import { getBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Badges awaiting response", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <ReceivedBadges repo={did} kind="awaiting" badges={(await getBadges(did)).awaiting} />;
}

/** Badges awarded to the workspace's account that await its response. */
export default function Page({ params }: { params: Promise<{ actor: string }> }) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
