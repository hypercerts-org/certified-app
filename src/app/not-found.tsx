import { Button } from "@hypercerts-org/ui-react";
import { PageHeader } from "@/components/page-title";

/** Fallback 404 for unmatched URLs outside `(site)` (e.g. `/welcome/missing`). */
export default function RootNotFound() {
  return (
    <main className="mx-auto w-full max-w-hc-page px-4 py-12 md:px-6">
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
    </main>
  );
}
