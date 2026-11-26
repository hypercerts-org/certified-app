import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { AwardedBadges } from "@/components/workspace-badges";
import { getAwardedBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Badges awarded", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <AwardedBadges badges={(await getAwardedBadges(did)).badges} />;
}

/** The badges the workspace's account awarded, and what each recipient answered. */
export default function Page({ params }: PageProps<"/[actor]/workspace/badges/awarded">) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
