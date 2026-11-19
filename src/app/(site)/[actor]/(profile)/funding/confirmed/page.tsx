import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { getActor } from "@/lib/hypercerts/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/funding/confirmed">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Funding confirmed` : "Not found" };
}

/** The funding the account confirmed (receipts it recorded): figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding/confirmed">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="confirmed" />}>
      <ProfileFunding params={props.params} which="confirmed" />
    </Suspense>
  );
}
