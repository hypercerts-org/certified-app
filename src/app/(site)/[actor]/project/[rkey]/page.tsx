import { Suspense } from "react";
import { ProfileFeedSkeleton } from "@/components/profile-feed";
import { projectFrom } from "@/components/project-page";
import { RecordTimeline } from "@/components/record-timeline";

async function Overview({ params }: Pick<PageProps<"/[actor]/project/[rkey]">, "params">) {
  const { project, uri, base } = await projectFrom(params);
  return <RecordTimeline uri={uri} owner={project.author} href={base} noun="project" />;
}

/** What happened in the project, newest first: its default tab. */
export default function ProjectOverviewPage(props: PageProps<"/[actor]/project/[rkey]">) {
  return (
    <Suspense fallback={<ProfileFeedSkeleton />}>
      <Overview params={props.params} />
    </Suspense>
  );
}
