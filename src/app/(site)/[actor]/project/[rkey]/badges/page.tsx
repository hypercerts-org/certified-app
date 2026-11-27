import { connection } from "next/server";
import { Suspense } from "react";
import { BadgeListSkeleton, RecordBadgeList } from "@/components/badges";
import { projectFrom } from "@/components/project-page";

async function ProjectBadges({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/badges">, "params">) {
  await connection(); // per visit: not in the cached page
  const { uri } = await projectFrom(params);
  return <RecordBadgeList uri={uri} />;
}

/** The badges the project received, with every detail, as a profile lists its own. */
export default function Page(props: PageProps<"/[actor]/project/[rkey]/badges">) {
  return (
    <Suspense fallback={<BadgeListSkeleton />}>
      <ProjectBadges params={props.params} />
    </Suspense>
  );
}
