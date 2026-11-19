import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgePage, BadgePageSkeleton, badgeFrom } from "@/components/badge-page";

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badge/[rkey]/awaiting">): Promise<Metadata> {
  const { badge } = await badgeFrom(params);
  return { title: `${badge.title}: awaiting response` };
}

/** A badge, and the accounts that haven't answered its award yet. */
export default function Page(props: PageProps<"/[actor]/badge/[rkey]/awaiting">) {
  return (
    <div className="page">
      <Suspense fallback={<BadgePageSkeleton which="awaiting" />}>
        <BadgePage params={props.params} which="awaiting" />
      </Suspense>
    </div>
  );
}
