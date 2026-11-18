"use client";

import { Text } from "@hypercerts-org/ui-react";
import type { ProfileFields } from "@/lib/hypercerts/views";
import { useProfileDisplay } from "@/lib/write-overlay/use-profile";

// A profile's name and description as this browser should show them: what the
// server rendered, or a save made here that the index hasn't caught up with.

/** The profile's name, or `fallback` (the handle, for accounts without one). */
export function ProfileName({
  did,
  rendered,
  fallback,
}: {
  did: string;
  rendered: ProfileFields;
  fallback?: string;
}) {
  return useProfileDisplay(did, rendered).displayName || fallback || did;
}

export function ProfileDescription({ did, rendered }: { did: string; rendered: ProfileFields }) {
  const { description } = useProfileDisplay(did, rendered);
  return description ? (
    <Text relaxed className="prewrap">
      {description}
    </Text>
  ) : (
    <Text tone="muted">No description yet.</Text>
  );
}
