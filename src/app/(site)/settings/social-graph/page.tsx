import type { Metadata } from "next";
import { Suspense } from "react";
import {
  requirePersonalSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";
import { SocialGraphSection } from "@/components/settings/social-graph-section";

export const metadata: Metadata = { title: "Social graph" };

async function PersonalSocialGraph() {
  const access = await requirePersonalSettings("/settings/social-graph");
  if (!access) return null;
  return (
    <SettingsSection description="The accounts you follow. What they publish shows in your feed.">
      <SocialGraphSection repoDid={access.user.did} allowExport />
    </SettingsSection>
  );
}

export default function PersonalSocialGraphSettingsPage() {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <PersonalSocialGraph />
    </Suspense>
  );
}
