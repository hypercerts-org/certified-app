import { Text } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { FollowingLists } from "@/components/follow-lists";
import { PeopleListSkeleton } from "@/components/people-list";
import { workspaceDid } from "@/components/workspace-access";
import { getActingAs } from "@/lib/acting-as";
import { listFollows, listProjectsFollowed } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Following", robots: { index: false } };

async function Following({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const [accounts, projects, actingAs] = await Promise.all([
    listFollows(did, "following"),
    listProjectsFollowed(did),
    getActingAs(),
  ]);
  // Unfollowing acts as the account you act as: only in its own workspace.
  const asThis = actingAs === did;
  return (
    <>
      {!asThis && (accounts.rows.length > 0 || projects.rows.length > 0) && (
        <Text size="body-sm" tone="muted">
          To unfollow, act as this account (in the account menu).
        </Text>
      )}
      <FollowingLists
        accounts={accounts}
        projects={projects}
        actingAs={asThis ? did : null}
        path={`${workspaceHref(did)}/followers/following`}
      />
    </>
  );
}

/** Whom the workspace's account follows: accounts, then projects, each with Following to unfollow. */
export default function FollowingPage({
  params,
}: PageProps<"/[actor]/workspace/followers/following">) {
  return (
    <Suspense fallback={<PeopleListSkeleton />}>
      <Following params={params} />
    </Suspense>
  );
}
