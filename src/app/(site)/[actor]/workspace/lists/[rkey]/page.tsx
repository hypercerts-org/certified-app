import { Text } from "@hypercerts-org/ui-react";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { workspaceHref } from "@/components/cards";
import { IntentLink } from "@/components/intent-link";
import { AddItemsDialog, DeleteListDialog, EditListDialog } from "@/components/list-dialogs";
import { ListItemsSkeleton } from "@/components/list-items";
import { ManageListItems } from "@/components/manage-list-items";
import { PageTitle } from "@/components/page-title";
import { workspaceDid } from "@/components/workspace-access";
import { LIST_KINDS } from "@/components/workspace-lists";
import { getList, getListItems } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "List", robots: { index: false } };

/** A record key as AT Protocol allows it; anything else is no list. */
const RKEY = /^[A-Za-z0-9._:~-]{1,512}$/;

async function Content({ params }: { params: Promise<{ actor: string; rkey: string }> }) {
  const { rkey } = await params;
  if (!RKEY.test(rkey)) notFound();
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const list = await getList(did, rkey);
  if (!list) notFound();
  const first = await getListItems(list);
  const kind = LIST_KINDS.find((k) => k.label === list.kind) ?? LIST_KINDS[0];
  return (
    <div className="manage-list">
      <div className="list-head">
        <IntentLink
          href={`${workspaceHref(did)}/lists`}
          className="list-back"
          aria-label="All lists"
        >
          <ArrowLeft size={18} aria-hidden />
        </IntentLink>
        <PageTitle className="workspace-title">
          <span dir="auto">{list.title}</span>
        </PageTitle>
      </div>
      <Text tone="muted">
        {kind.label} list · {list.itemCount === 1 ? "1 item" : `${list.itemCount} items`}
      </Text>
      {(list.description ?? list.summary) && (
        <Text className="prewrap" dir="auto">
          {list.description ?? list.summary}
        </Text>
      )}
      <div className="manage-list-actions">
        <AddItemsDialog noun={kind.noun} />
        <EditListDialog title={list.title} description={list.description ?? list.summary ?? ""} />
        <DeleteListDialog title={list.title} itemCount={list.itemCount} />
      </div>
      <ManageListItems list={list.uri} initial={first} />
    </div>
  );
}

/** One of the workspace account's lists, to manage: its details and items. */
export default function Page({ params }: PageProps<"/[actor]/workspace/lists/[rkey]">) {
  return (
    <Suspense fallback={<ListItemsSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
