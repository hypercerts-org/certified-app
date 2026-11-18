import type { Metadata } from "next";
import { WorkspaceAccess } from "@/components/workspace-access";
import { GivenEndorsements } from "@/components/workspace-endorsements";
import { listEndorsements } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Endorsements given", robots: { index: false } };

async function Given({ did }: { did: string }) {
  return <GivenEndorsements page={await listEndorsements(did, "given")} />;
}

/** Endorsements the workspace's account gave. */
export default function GivenPage({ params }: PageProps<"/[actor]/workspace/endorsements/given">) {
  return (
    <WorkspaceAccess params={params} section="/endorsements/given">
      {({ did }) => <Given did={did} />}
    </WorkspaceAccess>
  );
}
