import { Heading, Text } from "@hypercerts-org/ui-react";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { IntentLink } from "@/components/intent-link";
import { ListItemList } from "@/components/list-item-list";
import { ListItemsSkeleton } from "@/components/list-items";
import { getActor, getList, getListItems } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";
import { profileActor } from "@/lib/profile-route";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

/** A record key as AT Protocol allows it; anything else is no list. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/lists/[rkey]">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const { actor: id, rkey } = await params;
  const actor = await getActor(decodeURIComponent(id));
  const list = actor && RKEY.test(rkey) ? await getList(actor.did, rkey) : null;
  if (!actor || !list) return { title: "Not found", robots: { index: false } };
  const owner = nameOf(actor);
  const slug = actor.handle ?? actor.did;
  return pageMetadata({
    title: `${list.title} (${owner})`,
    description: trimMetaDescription(
      list.description ?? list.summary,
      `${list.kind} list curated by ${owner} on Certified.`,
    ),
    path: `/${encodeURIComponent(slug)}/lists/${encodeURIComponent(rkey)}`,
  });
}

async function Content({ params }: Pick<PageProps<"/[actor]/lists/[rkey]">, "params">) {
  const { rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  const { actor, base } = await profileActor(params);
  const list = await getList(actor.did, rkey);
  if (!list) notFound();
  const first = await getListItems(list);
  return (
    <div className="profile-list-page">
      <div className="list-head">
        <IntentLink href={`${base}/lists`} className="list-back" aria-label="All lists">
          <ArrowLeft size={18} aria-hidden />
        </IntentLink>
        <Heading level={2} size="heading">
          <span dir="auto">{list.title}</span>
          <span className="profile-section-count"> {list.itemCount}</span>
        </Heading>
      </div>
      {(list.description ?? list.summary) && (
        <Text className="prewrap" dir="auto">
          {list.description ?? list.summary}
        </Text>
      )}
      <ListItemList list={list.uri} initial={first} />
    </div>
  );
}

/** One of the account's lists, and its items. */
export default function ListPage(props: PageProps<"/[actor]/lists/[rkey]">) {
  return (
    <Suspense fallback={<ListItemsSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}
