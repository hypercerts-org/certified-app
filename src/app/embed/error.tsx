"use client";

import { Banner, Button } from "@hypercerts-org/ui-react";

export default function EmbedError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="embed stack">
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        This couldn't be loaded right now.
      </Banner>
    </main>
  );
}
