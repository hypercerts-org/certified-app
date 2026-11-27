import { Suspense } from "react";
import { ExploreTabs, ExploreTabsSkeleton } from "@/components/explore-toolbar";
import { PageHeader } from "@/components/page-title";
import { pageMetadata } from "@/lib/seo";

export const ensureStatic = "prefetch";

export const metadata = pageMetadata({
  title: "Explore",
  description: "Activities, projects and accounts across the Certified network.",
  path: "/explore",
});

// Explore: the title, then the tabs (each its own address), then the tab's
// page. The tabs carry the search from one to the next.
export default function ExploreLayout({ children }: LayoutProps<"/explore">) {
  return (
    <div className="page explore">
      <PageHeader
        title="Explore"
        description="Activities, projects and accounts across the Certified network."
      />
      <div className="explore-panel">
        <Suspense fallback={<ExploreTabsSkeleton />}>
          <ExploreTabs />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
