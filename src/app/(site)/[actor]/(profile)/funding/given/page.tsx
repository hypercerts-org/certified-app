import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/funding/given">): Promise<Metadata> {
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Funding given` : "Not found" };
}

/** The funding the account gave: figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding/given">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="given" />}>
      <ProfileFunding params={props.params} which="given" />
    </Suspense>
  );
}
