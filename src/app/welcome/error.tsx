"use client";

import { Button } from "@hypercerts-org/ui-react";
import { PageHeader } from "@/components/page-title";

export default function WelcomeError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-hc-page px-4 py-12 md:px-6">
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
    </main>
  );
}
