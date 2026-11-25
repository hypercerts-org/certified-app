import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { IssuedBadges } from "@/components/workspace-badges";
import { getIssuedBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Badges issued", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <IssuedBadges repo={did} badges={(await getIssuedBadges(did)).badges} />;
}

/** The badges the workspace's account defined, and how many hold each. */
export default function Page({ params }: { params: Promise<{ actor: string }> }) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
