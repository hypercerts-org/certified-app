import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { ReceivedBadges } from "@/components/workspace-badges";
import { getRejectedBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Rejected badges", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <ReceivedBadges kind="rejected" badges={await getRejectedBadges(did)} />;
}

/** The badges the workspace's account rejected: never on its profile. */
export default function Page({ params }: { params: Promise<{ actor: string }> }) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
