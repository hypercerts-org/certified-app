import { Newspaper } from "lucide-react";
import { Suspense } from "react";
import { Empty } from "@/components/empty";
import { projectFrom } from "@/components/project-page";
import { UpdateList, UpdatesSkeleton } from "@/components/record-context";
import { getAttachments } from "@/lib/hypercerts/queries";

async function ProjectUpdates({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/updates">, "params">) {
  const { actor, uri } = await projectFrom(params);
  const { updates } = await getAttachments(uri);
  // The tab shows only with updates; an old link can still land here.
  if (updates.length === 0) return <Empty icon={Newspaper} title="No updates yet" />;
  return <UpdateList updates={updates} ownerDid={actor.did} />;
}

/** News from the project, newest first. */
export default function Page(props: PageProps<"/[actor]/project/[rkey]/updates">) {
  return (
    <Suspense fallback={<UpdatesSkeleton />}>
      <ProjectUpdates params={props.params} />
    </Suspense>
  );
}
