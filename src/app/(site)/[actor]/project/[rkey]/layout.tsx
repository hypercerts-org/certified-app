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

// A project: its header across the top, then (as on a profile) the tabs and
// the open tab on the left, and the side column on the right.

export async function generateStaticParams() {
  return [{ actor: "did:plc:6taywkxm2zmfsbqikjdaapey", rkey: "3msind56wn22t" }];
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[actor]/project/[rkey]">): Promise<Metadata> {
  const { project } = await projectFrom(params);
  return { title: project.title };
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
