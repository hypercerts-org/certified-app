"use client";

import { useSession } from "@/hooks/use-session";
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
  const { handle } = useSession();
  usePageTitle("Settings");
  usePageTitleBreadcrumb(
    handle ? { left: { text: handle, href: `/profile/${handle}` } } : null,
  );
  return <SettingsPanel />;
}
