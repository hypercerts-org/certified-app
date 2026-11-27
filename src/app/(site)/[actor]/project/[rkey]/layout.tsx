import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileRailSkeleton } from "@/components/profile-rail";
import {
  ProjectHeader,
  ProjectHeaderSkeleton,
  ProjectRail,
  ProjectTabs,
  ProjectTabsSkeleton,
  projectFrom,
} from "@/components/project-page";
import { nameOf } from "@/lib/hypercerts/views";
import { pageMetadata, trimMetaDescription } from "@/lib/seo";

// A project: its header across the top, then (as on a profile) the tabs and
// the open tab on the left, and the side column on the right.

// Keep App Shell and hover per-link prefetches static: viewer actions stream
// in on navigation, so links and tabs never fire runtime server renders ahead
// of a click (see the profile layout).
export const ensureStatic = "prefetch";

// Prerender one known project at build time; every other is prerendered on its
// first visit and cached per URL (ISR), header, tabs and rail included, so a
// later visit shows them at once. On Vercel a click to one not yet cached
// waits for that prerender, so it holds only what the API answers quickly:
// the parts that need outside lookups or slow API filters (the author's
// handle, figures, place, "Also on", the timeline, every tab's list) call
// connection() and stream in on each visit (see the profile layout).
export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msind56wn22t" }];
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[actor]/project/[rkey]">): Promise<Metadata> {
  const { project, base } = await projectFrom(params);
  const author = nameOf(project.author);
  const fallback = `Project by ${author} on Certified.`;
  return pageMetadata({
    title: project.title,
    description: trimMetaDescription(project.summary, fallback),
    path: base,
    image: project.bannerUrl ?? project.imageUrl,
    type: "website",
  });
}

export default function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[actor]/project/[rkey]">) {
  return (
    <div className="page record-page project">
      <Suspense fallback={<ProjectHeaderSkeleton />}>
        <ProjectHeader params={params} />
      </Suspense>
      <div className="page-columns">
        <div className="page-main">
          <Suspense fallback={<ProjectTabsSkeleton />}>
            <ProjectTabs />
          </Suspense>
          {children}
        </div>
        <aside className="page-rail" aria-label="About this project">
          <Suspense fallback={<ProfileRailSkeleton />}>
            <ProjectRail params={params} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
