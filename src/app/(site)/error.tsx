"use client";

import { Button, Heading, Text } from "@hypercerts-org/ui-react";

export default function SiteError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page stack">
      <Heading level={1} size="display-3">
        Something went wrong
      </Heading>
      <Text tone="muted">This page couldn't be loaded right now. Please try again shortly.</Text>
      <div>
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
