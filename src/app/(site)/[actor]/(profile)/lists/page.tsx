import { Text } from "@hypercerts-org/ui-react";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Empty } from "@/components/empty";
import { ListGroups, ListGroupsSkeleton } from "@/components/profile-lists";
import { getActor, listLists } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({ params }: PageProps<"/[actor]/lists">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Lists` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/lists">, "params">) {
  const { actor, base } = await profileActor(params, "/lists");
  const { lists, more } = await listLists(actor.did);
  if (lists.length === 0) return <Empty icon={ListChecks} title="No lists yet" />;
  return (
    <div className="profile-list-page">
      <ListGroups lists={lists} base={`${base}/lists`} />
      {more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {lists.length}.
        </Text>
      )}
    </div>
  );
}

/** The lists the account keeps, by what they hold. */
export default function ListsPage(props: PageProps<"/[actor]/lists">) {
  return (
    <Suspense fallback={<ListGroupsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
