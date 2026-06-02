"use client";

import { useSession } from "@/hooks/use-session";
import { useOrg } from "@/lib/groups/org-context";
import {
  usePageTitle,
  usePageTitleBreadcrumb,
} from "@/lib/navbar-context";
import SettingsPanel from "@/components/settings/settings-panel";

/**
 * Standalone `/settings` route — preserved as a deep-link target.
 *
 * The same panel is rendered from the profile page at
 * `/profile/<own-handle>?tab=settings`, where it sits alongside the
 * profile sidebar. Both paths share the same `<SettingsPanel>`
 * component so the scroll-spy + deep-link `#section` behaviour is
 * identical regardless of which URL the user lands on.
 */
export default function SettingsPage() {
  const { handle: personalHandle } = useSession();
  const { activeOrg } = useOrg();
  // The breadcrumb above the settings panel shows whichever identity
  // the user is currently acting as — so clicking it lands on the
  // matching profile, not the personal one. Matches the chrome
  // convention.
  const activeHandle = activeOrg?.handle ?? personalHandle;
  usePageTitle("Settings");
  usePageTitleBreadcrumb(
    activeHandle
      ? { left: { text: activeHandle, href: `/profile/${activeHandle}` } }
      : null,
  );
  return <SettingsPanel />;
}
