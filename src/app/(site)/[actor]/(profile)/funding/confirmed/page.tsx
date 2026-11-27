import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/funding/confirmed">): Promise<Metadata> {
  return profileTabMetadata(params, "Funding confirmed");
}

/** The funding the account confirmed (receipts it recorded): figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding/confirmed">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="confirmed" />}>
      <ProfileFunding params={props.params} which="confirmed" />
    </Suspense>
  );
}
