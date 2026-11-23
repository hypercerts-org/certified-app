import { Text } from "@hypercerts-org/ui-react";
import type { ProfileFields } from "@/lib/hypercerts/views";

// A profile's name and description as the index has them. A save waits for
// the index and expires the cached page (lib/hypercerts/actions), so these
// show it from the next render on.

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
  return rendered.displayName || fallback || did;
}

export function ProfileDescription({ rendered }: { rendered: ProfileFields }) {
  if (!rendered.description) return null;
  return (
    <Text relaxed className="prewrap">
      {rendered.description}
    </Text>
  );
}
