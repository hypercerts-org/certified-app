import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectHeader, ProjectHeaderSkeleton, projectFrom } from "@/components/project-page";

// A project: its header and tabs, then the open tab (Activities, Funding,
// Followers).

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
    <div className="page project">
      <Suspense fallback={<ProjectHeaderSkeleton />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}
