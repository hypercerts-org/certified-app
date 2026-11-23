import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { workspaceDid } from "@/components/workspace-access";
import { listFollows } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Followers", robots: { index: false } };

async function Followers({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <PeopleList page={await listFollows(did, "followers")} empty="No followers yet" />;
}

/** Who follows the workspace's account. */
export default function FollowersPage({ params }: PageProps<"/[actor]/workspace/followers">) {
  return (
    <Suspense fallback={<PeopleListSkeleton />}>
      <Followers params={params} />
    </Suspense>
  );
}
