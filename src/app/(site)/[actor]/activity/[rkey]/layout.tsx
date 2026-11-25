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

// An activity: its header across the top, then (as on a project) the tabs
// and the open tab on the left, and the side column on the right.

export async function generateMetadata({
  params,
}: LayoutProps<"/[actor]/activity/[rkey]">): Promise<Metadata> {
  const { activity } = await activityFrom(params);
  return { title: activity.title };
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
            <ActivityTabs params={params} />
          </Suspense>
          {children}
        </div>
        <aside className="page-rail" aria-label="About this activity">
          <Suspense fallback={null}>
            <ActivityRail params={params} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
