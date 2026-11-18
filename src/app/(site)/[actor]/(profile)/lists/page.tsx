import { Skeleton } from "@hypercerts-org/ui-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, EmptyState, Heading, Text } from "@hypercerts-org/ui-react";
import { listLists } from "@/lib/hypercerts/queries";
import { getActor } from "@/lib/hypercerts/queries";
import { profileActor } from "@/lib/profile-route";

export async function generateMetadata({ params }: PageProps<"/[actor]/lists">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Lists` : "Not found" };
}

async function Content({ params }: Pick<PageProps<"/[actor]/lists">, "params">) {
  const { actor } = await profileActor(params, "/lists");
  const { lists, more } = await listLists(actor.did);
  if (lists.length === 0) return <EmptyState title="No lists yet" />;
  return (
    <div className="profile-list-page">
      <ul className="work-grid">
        {lists.map((list) => (
          <Card as="li" variant="panel" className="card" key={list.uri}>
            <Heading level={2} size="heading">
              {list.title}
            </Heading>
            <Text size="body-sm" tone="muted">
              {list.kind} · {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
            </Text>
            {list.summary && <Text size="body-sm">{list.summary}</Text>}
          </Card>
        ))}
      </ul>
      {more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {lists.length}.
        </Text>
      )}
    </div>
  );
}

/** The lists the account keeps: accounts, activities, projects or endorsements. */
export default function ListsPage(props: PageProps<"/[actor]/lists">) {
  return (
    <Suspense fallback={<Skeleton variant="text" lines={6} />}>
      <Content params={props.params} />
    </Suspense>
  );
}
