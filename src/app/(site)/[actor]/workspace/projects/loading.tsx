import { PageTitle } from "@/components/page-title";
import { WorkFoldersSkeleton } from "@/components/work-folders";

/** Shown at once on the way here, while the folders load. */
export default function Loading() {
  return (
    <>
      <PageTitle className="workspace-title">Projects and activities</PageTitle>
      <WorkFoldersSkeleton />
    </>
  );
}
