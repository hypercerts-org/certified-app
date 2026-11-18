import type { Metadata } from "next";
import { workspaceDid } from "@/components/workspace-access";
import { GivenEndorsements } from "@/components/workspace-endorsements";
import { listEndorsements } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Endorsements given", robots: { index: false } };

async function Given({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  return <GivenEndorsements page={await listEndorsements(did, "given")} />;
}

/** Endorsements the workspace's account gave. */
export default function GivenPage({ params }: PageProps<"/[actor]/workspace/endorsements/given">) {
  return <Given params={params} />;
}
