"use client";

import { Button } from "@hypercerts-org/ui-react";
import { PageHeader } from "@/components/page-title";

export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page">
      <PageHeader
        title="Something went wrong"
        description="This page couldn't be loaded right now. Please try again shortly."
      />
      <div>
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
