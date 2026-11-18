import type { Metadata } from "next";
import { workspaceDid } from "@/components/workspace-access";
import { LIST_KINDS, ListCards, type ListKind } from "@/components/workspace-lists";
import { listLists } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Account lists", robots: { index: false } };

const KIND = LIST_KINDS.find((kind) => kind.label === "Accounts") as ListKind;

async function Lists({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { lists, more } = await listLists(did);
  return (
    <ListCards kind={KIND} lists={lists.filter((list) => list.kind === KIND.label)} more={more} />
  );
}

/** The workspace account's lists of accounts. */
export default function Page({ params }: PageProps<"/[actor]/workspace/lists/accounts">) {
  return <Lists params={params} />;
}
