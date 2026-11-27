import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgePage, BadgePageSkeleton, badgeFrom } from "@/components/badge-page";
import { nameOf } from "@/lib/hypercerts/views";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

// No generateStaticParams: with it, a click to a page not yet cached waits
// on Vercel for the whole page to be prerendered (every list, every lookup)
// before anything shows. Without it, the click gets the app shell at once and
// the page streams in, as on a direct visit. Pages are still cached per URL.

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
