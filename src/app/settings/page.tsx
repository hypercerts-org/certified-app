"use client";

import { usePageTitle } from "@/lib/navbar-context";
import SettingsPanel from "@/components/settings/settings-panel";

/**
 * `/settings`: the signed-in account's settings, whichever workspace is
 * open (a group's are at `/groups/{did}/settings`). The panel renders the whole page (header naming the
 * account, section nav, the selected section), so the legacy own-profile
 * `?tab=settings` shows the same thing. Sections are addressed by hash
 * (`/settings#app-passwords`).
 */
export default function SettingsPage() {
  usePageTitle("Settings");
  return <SettingsPanel />;
}
