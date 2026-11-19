import type { Metadata } from "next";
import { Suspense } from "react";
import { workspaceDid } from "@/components/workspace-access";
import {
  LIST_KINDS,
  ListCards,
  ListCardsSkeleton,
  type ListKind,
} from "@/components/workspace-lists";
import { listLists } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Project lists", robots: { index: false } };

const KIND = LIST_KINDS.find((kind) => kind.label === "Projects") as ListKind;

async function Lists({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { lists, more } = await listLists(did);
  return (
    <ListCards kind={KIND} lists={lists.filter((list) => list.kind === KIND.label)} more={more} />
  );
}

/** The workspace account's lists of projects. */
export default function Page({ params }: PageProps<"/[actor]/workspace/lists/projects">) {
  return (
    <Suspense fallback={<ListCardsSkeleton />}>
      <Lists params={params} />
    </Suspense>
  );
}
