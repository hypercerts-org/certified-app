import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeListSkeleton } from "@/components/badges";
import { workspaceDid } from "@/components/workspace-access";
import { YourBadges } from "@/components/workspace-badges";
import { getYourBadges } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Your badges", robots: { index: false } };

async function Content({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <YourBadges repo={did} badges={await getYourBadges(did)} />;
}

/** The badges the workspace's account created, and how many hold each. */
export default function Page({ params }: PageProps<"/[actor]/workspace/badges/yours">) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
