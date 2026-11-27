import { Text } from "@hypercerts-org/ui-react";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Empty } from "@/components/empty";
import { ListGroups, ListGroupsSkeleton } from "@/components/profile-lists";
import { listLists } from "@/lib/hypercerts/queries";
import { profileActor, profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/lists">): Promise<Metadata> {
  return profileTabMetadata(params, "Lists");
}

async function Content({ params }: Pick<PageProps<"/[actor]/lists">, "params">) {
  const { actor, base } = await profileActor(params);
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
