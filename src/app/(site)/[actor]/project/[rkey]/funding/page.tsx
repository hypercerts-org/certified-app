import { Suspense } from "react";
import { Funding, FundingSkeleton } from "@/components/funding";
import { projectFrom } from "@/components/project-page";

async function ProjectFunding({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/funding">, "params">) {
  const { uri } = await projectFrom(params);
  // "For" is this project on every row; "To" stays (it can be an activity).
  return <Funding filter={{ for: uri }} label="Received" omit="for" empty="No funding yet" />;
}

/** The funding recorded for the project: its figures and receipts. */
export default function Page(props: PageProps<"/[actor]/project/[rkey]/funding">) {
  return (
    <Suspense fallback={<FundingSkeleton />}>
      <ProjectFunding params={props.params} />
    </Suspense>
  );
}
