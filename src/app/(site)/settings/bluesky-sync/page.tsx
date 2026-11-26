import type { Metadata } from "next";
import { Suspense } from "react";
import { BlueskySyncSection } from "@/components/settings/bluesky-sync-section";
import {
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "Bluesky sync" };

async function PersonalBlueskySync() {
  const access = await requirePersonalSettings("/settings/bluesky-sync");
  if (!access) return null;
  return (
    <SettingsSection>
      <BlueskySyncSection repoDid={access.user.did} allowExport />
    </SettingsSection>
  );
}

export default function PersonalBlueskySyncSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={2} />}>
      <PersonalBlueskySync />
    </Suspense>
  );
}
