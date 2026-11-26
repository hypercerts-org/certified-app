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

export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msind56wn22t" }];
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[actor]/project/[rkey]">): Promise<Metadata> {
  const { actor, project, base } = await projectFrom(params);
  const author = nameOf(actor);
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
            <ProjectTabs params={params} />
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
