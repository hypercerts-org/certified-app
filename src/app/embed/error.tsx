"use client";

import { Button, ErrorMessage } from "@hypercerts-org/ui-react";

export default function EmbedError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="embed stack">
      <ErrorMessage>This couldn't be loaded right now.</ErrorMessage>
      <div>
        <Button variant="secondary" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
