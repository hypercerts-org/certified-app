import { Text } from "@hypercerts-org/ui-react";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { Empty } from "@/components/empty";
import { NewListDialog } from "@/components/list-dialogs";
import { PageTitle } from "@/components/page-title";
import { ListGroups, ListGroupsSkeleton } from "@/components/profile-lists";
import { workspaceDid } from "@/components/workspace-access";
import { listLists } from "@/lib/hypercerts/queries";

// Workspace → Lists: the account's lists as its profile shows them, grouped by
// what they hold, each leading to the page where it is managed. New list asks
// what the list will hold.

export const metadata: Metadata = { title: "Lists", robots: { index: false } };

async function Lists({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { lists, more } = await listLists(did);
  if (lists.length === 0) {
    return (
      <Empty
        icon={ListChecks}
        title="No lists yet"
        description="A list gathers activities, projects, accounts or endorsements to show together on the profile, like a funding round's applicants."
        action={<NewListDialog repo={did} />}
      />
    );
  }
  return (
    <>
      <ListGroups lists={lists} base={`${workspaceHref(did)}/lists`} />
      {more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {lists.length}.
        </Text>
      )}
    </>
  );
}

async function NewListAction({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null;
  return <NewListDialog repo={did} />;
}

/** The workspace account's lists, to open and manage. */
export default function ListsPage({ params }: PageProps<"/[actor]/workspace/lists">) {
  return (
    <div className="workspace-lists">
      <div className="workspace-heading">
        <PageTitle className="workspace-title">Lists</PageTitle>
        <Suspense fallback={null}>
          <NewListAction params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<ListGroupsSkeleton />}>
        <Lists params={params} />
      </Suspense>
    </div>
  );
}
