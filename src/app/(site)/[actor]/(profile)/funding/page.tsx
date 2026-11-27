import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({ params }: PageProps<"/[actor]/funding">): Promise<Metadata> {
  return profileTabMetadata(params, "Funding received");
}

/** The funding the account received: figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="received" />}>
      <ProfileFunding params={props.params} which="received" />
    </Suspense>
  );
}
