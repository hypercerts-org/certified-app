import { Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { ExploreTabs, ExploreTabsSkeleton } from "@/components/explore-toolbar";
import { PageTitle } from "@/components/page-title";

// Explore: the title, then the tabs (each its own address), then the tab's
// page. The tabs carry the search from one to the next.
export default function ExploreLayout({ children }: LayoutProps<"/explore">) {
  return (
    <div className="page explore">
      <div className="stack">
        <PageTitle>Explore</PageTitle>
        <Text tone="muted">Activities, projects and accounts across the Certified network.</Text>
      </div>
      <div className="explore-panel">
        <Suspense fallback={<ExploreTabsSkeleton />}>
          <ExploreTabs />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
