import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { getActor } from "@/lib/hypercerts/queries";
import { nameOf } from "@/lib/hypercerts/views";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/funding">): Promise<Metadata> {
  // The title needs the checked handle: on each visit, not in the cached page.
  await connection();
  const actor = await getActor(decodeURIComponent((await params).actor));
  return { title: actor ? `${nameOf(actor)}: Funding received` : "Not found" };
}

/** The funding the account received: figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="received" />}>
      <ProfileFunding params={props.params} which="received" />
    </Suspense>
  );
}
