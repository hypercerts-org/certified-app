import { Button } from "@hypercerts-org/ui-react";
import { PageHeader } from "@/components/page-title";

/** An unknown account, project or page, inside the site's navigation. */
export default function NotFound() {
  return (
    <div className="page">
      <PageHeader
        title="Not found"
        description="There's no account or page at this address. Check the handle, or look for it in Explore."
      />
      <div>
        <Button href="/explore" variant="secondary">
          Explore
        </Button>
      </div>
    </div>
  );
}
