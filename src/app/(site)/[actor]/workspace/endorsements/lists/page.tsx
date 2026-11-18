import type { Metadata } from "next";
import { workspaceDid } from "@/components/workspace-access";
import { EndorsementLists } from "@/components/workspace-endorsements";
import { listLists } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Endorsement lists", robots: { index: false } };

async function Lists({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const { lists, more } = await listLists(did);
  return (
    <EndorsementLists lists={lists.filter((list) => list.kind === "Endorsements")} more={more} />
  );
}

/** The endorsement lists the workspace's account keeps. */
export default function ListsPage({ params }: PageProps<"/[actor]/workspace/endorsements/lists">) {
  return <Lists params={params} />;
}
