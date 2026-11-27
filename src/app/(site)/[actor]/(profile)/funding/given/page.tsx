import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileFunding, ProfileFundingSkeleton } from "@/components/funding";
import { profileTabMetadata } from "@/lib/profile-route";

export function generateMetadata({
  params,
}: PageProps<"/[actor]/funding/given">): Promise<Metadata> {
  return profileTabMetadata(params, "Funding given");
}

/** The funding the account gave: figures and receipts. */
export default function Page(props: PageProps<"/[actor]/funding/given">) {
  return (
    <Suspense fallback={<ProfileFundingSkeleton which="given" />}>
      <ProfileFunding params={props.params} which="given" />
    </Suspense>
  );
}
