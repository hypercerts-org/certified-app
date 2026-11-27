import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgePage, BadgePageSkeleton, badgeFrom } from "@/components/badge-page";
import { nameOf } from "@/lib/hypercerts/views";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

// Prerender one known badge at build time; every other is prerendered on its
// first visit and cached per URL, the badge itself included. Its holders
// render on each visit (BadgePage), so a click to a badge not yet cached
// waits on Vercel only for the definition (see the profile layout).
export async function generateStaticParams() {
  return [{ actor: "did:plc:ipcx4wzsuz3c6nkqgas75rxw", rkey: "3mz62dbgyff2t" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/[actor]/badge/[rkey]">): Promise<Metadata> {
  const { badge, base } = await badgeFrom(params);
  const issuer = nameOf(badge.issuer);
  return pageMetadata({
    title: badge.title,
    description: trimMetaDescription(badge.description, `Badge issued by ${issuer} on Certified.`),
    path: base,
    image: badge.iconUrl,
    card: badge.iconUrl ? "summary" : "summary_large_image",
  });
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
