import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ActivityHeader,
  ActivityHeaderSkeleton,
  ActivityRail,
  ActivityTabs,
  ActivityTabsSkeleton,
  activityFrom,
} from "@/components/activity-page";
import { ProfileRailSkeleton } from "@/components/profile-rail";
import { nameOf } from "@/lib/hypercerts/views";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

// An activity: its header across the top, then (as on a project) the tabs
// and the open tab on the left, and the side column on the right.

// Keep App Shell and hover per-link prefetches static: viewer actions stream
// in on navigation, so links and tabs never fire runtime server renders ahead
// of a click (see the profile layout).
export const ensureStatic = "prefetch";

// Prerender one known activity at build time; every other is prerendered on its
// first visit and cached per URL (ISR), header, tabs and rail included, so a
// later visit shows them at once. On Vercel a click to one not yet cached
// waits for that prerender, so it holds only what the API answers quickly:
// the parts that need outside lookups or slow API filters (the author's
// handle, figures, place, "Also on", the timeline, every tab's list) call
// connection() and stream in on each visit (see the profile layout).
export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msindbwqzs2t" }];
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[actor]/activity/[rkey]">): Promise<Metadata> {
  const { activity, base } = await activityFrom(params);
  const author = nameOf(activity.author);
  const fallback = `Activity by ${author} on Certified.`;
  return pageMetadata({
    title: activity.title,
    description: trimMetaDescription(activity.summary, fallback),
    path: base,
    image: activity.imageUrl,
    type: "article",
  });
}

export default function ActivityLayout({
  children,
  params,
}: LayoutProps<"/[actor]/activity/[rkey]">) {
  return (
    <div className="page record-page">
      <Suspense fallback={<ActivityHeaderSkeleton />}>
        <ActivityHeader params={params} />
      </Suspense>
      <div className="page-columns">
        <div className="page-main">
          <Suspense fallback={<ActivityTabsSkeleton />}>
            <ActivityTabs />
          </Suspense>
          {children}
        </div>
        <aside className="page-rail" aria-label="About this activity">
          <Suspense fallback={<ProfileRailSkeleton />}>
            <ActivityRail params={params} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
