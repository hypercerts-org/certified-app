import { Text } from "@hypercerts-org/ui-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { PeopleList, PeopleListSkeleton } from "@/components/people-list";
import { projectFrom } from "@/components/project-page";
import { getProjectFollowers } from "@/lib/hypercerts/queries";

const numberFormat = new Intl.NumberFormat("en");

async function Followers({
  params,
}: Pick<PageProps<"/[actor]/project/[rkey]/followers">, "params">) {
  await connection(); // per visit: not in the cached page
  const { uri } = await projectFrom(params);
  const page = await getProjectFollowers(uri);
  return (
    <div className="stack">
      {/* Its own "more" line, below, gives the total. */}
      <PeopleList page={{ ...page, more: false }} empty="No followers yet" />
      {page.more && (
        <Text size="body-sm" tone="muted">
          Showing the latest {page.rows.length} of {numberFormat.format(page.total)}.
        </Text>
      )}
    </div>
  );
}

/** The accounts that follow the project, newest first. */
export default function Page(props: PageProps<"/[actor]/project/[rkey]/followers">) {
  return (
    <Suspense fallback={<PeopleListSkeleton />}>
      <Followers params={props.params} />
    </Suspense>
  );
}
