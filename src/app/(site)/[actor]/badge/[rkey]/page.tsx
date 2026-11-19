import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgePage, BadgePageSkeleton, badgeFrom } from "@/components/badge-page";

// Prerender one known badge at build time; every other badge gets the app
// shell first and is then rendered and cached per URL.
export async function generateStaticParams() {
  return [{ actor: "did:plc:ipcx4wzsuz3c6nkqgas75rxw", rkey: "3mz62dbgyff2t" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badge/[rkey]">): Promise<Metadata> {
  const { badge } = await badgeFrom(params);
  return { title: badge.title };
}

/** A badge, and the accounts that accepted it. */
export default function Page(props: PageProps<"/[actor]/badge/[rkey]">) {
  return (
    <div className="page">
      <Suspense fallback={<BadgePageSkeleton which="accepted" />}>
        <BadgePage params={props.params} which="accepted" />
      </Suspense>
    </div>
  );
}
