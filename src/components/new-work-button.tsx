"use client";

// Workspace → Projects and activities: the action at the tab bar's end, the
// open tab's own (New project on Projects, New activity on Activities).

import { Button } from "@hypercerts-org/ui-react";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";

/** The section's action, by tab: under `section` (the Projects tab's address). */
export function NewWorkButton({ section }: { section: string }) {
  const onActivities = usePathname()?.endsWith("/activities") ?? false;
  return onActivities ? (
    <Button href={`${section}/new-activity`} variant="primary" size="sm">
      <Plus size={16} aria-hidden />
      New activity
    </Button>
  ) : (
    <Button href={`${section}/new-project`} variant="primary" size="sm">
      <Plus size={16} aria-hidden />
      New project
    </Button>
  );
}
