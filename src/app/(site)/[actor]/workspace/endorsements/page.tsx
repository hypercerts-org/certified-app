import type { Metadata } from "next";
import { Suspense } from "react";
import { actorHref } from "@/components/cards";
import { workspaceDid } from "@/components/workspace-access";
import { EndorsementRowsSkeleton, ReceivedEndorsements } from "@/components/workspace-endorsements";
import { getActor, listEndorsements } from "@/lib/hypercerts/queries";

export const metadata: Metadata = { title: "Endorsements", robots: { index: false } };

async function Received({ params }: { params: Promise<{ actor: string }> }) {
  const did = await workspaceDid(params);
  if (!did) return null; // no access: the workspace layout says why
  const [page, actor] = await Promise.all([listEndorsements(did, "received", true), getActor(did)]);
  return (
    <ReceivedEndorsements
      repo={did}
      page={page}
      profile={actorHref({ did, handle: actor?.handle ?? null })}
    />
  );
}

/** Endorsements the workspace's account received, hidden ones included. */
export default function ReceivedPage({ params }: PageProps<"/[actor]/workspace/endorsements">) {
  return (
    <Suspense fallback={<EndorsementRowsSkeleton />}>
      <Received params={params} />
    </Suspense>
  );
}
