import { WorkFoldersSkeleton } from "@/components/work-folders";

/** Shown at once on the way here, while the folders load. */
export default function Loading() {
  return (
    <>
      <h1 className="workspace-title">Projects and activities</h1>
      <WorkFoldersSkeleton />
    </>
  );
}
