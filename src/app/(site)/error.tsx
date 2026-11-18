"use client";

import { Button, Text } from "@hypercerts-org/ui-react";
import { PageTitle } from "@/components/page-title";

export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page stack">
      <PageTitle>Something went wrong</PageTitle>
      <Text tone="muted">This page couldn't be loaded right now. Please try again shortly.</Text>
      <div>
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
