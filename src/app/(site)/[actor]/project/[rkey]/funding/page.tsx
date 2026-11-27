import { connection } from "next/server";
import { Suspense } from "react";
import { Funding, FundingSkeleton } from "@/components/funding";
import { projectFrom } from "@/components/project-page";

async function ProjectFunding({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/funding">, "params">) {
  await connection(); // per visit: not in the cached page
  const { uri } = await projectFrom(params);
  // Every row is for this project, to its organization: neither is repeated.
  return (
    <Funding filter={{ for: uri }} label="Received" omit={["to", "for"]} empty="No funding yet" />
  );
}

/** The funding recorded for the project: its figures and receipts. */
export default function Page(props: PageProps<"/[actor]/project/[rkey]/funding">) {
  return (
    <Suspense fallback={<FundingSkeleton />}>
      <ProjectFunding params={props.params} />
    </Suspense>
  );
}
