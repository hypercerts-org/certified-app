import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { getActor } from "@/lib/hypercerts/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/funding">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${actor.displayName}: Funding received` : "Not found" };
}

/** The funding the account received: figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="received" />}>
      <ProfileFunding params={props.params} which="received" />
    </Suspense>
  );
}
