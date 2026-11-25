import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { ReceivedBadges } from "@/components/workspace-badges";
import { getBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Accepted badges", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <ReceivedBadges repo={did} kind="accepted" badges={(await getBadges(did)).accepted} />;
}

/** The badges the workspace's account accepted: those its profile shows. */
export default function Page({ params }: { params: Promise<{ actor: string }> }) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
