import type { Metadata } from "next";
import { Suspense } from "react";
import { requireGroupSettings, SettingsCardsSkeleton } from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";
import { SocialGraphSection } from "@/components/settings/social-graph-section";

export const metadata: Metadata = { title: "Social graph" };

async function GroupSocialGraph({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/social-graph");
  if (!access) return null;
  return (
    <SettingsSection description="The accounts this group follows. What they publish shows in the group's feed.">
      <SocialGraphSection
        repoDid={access.groupDid}
        allowExport={access.isSelfOwned}
        description="Compare this group's Certified follows with its Bluesky follows, and import the ones missing here."
      />
    </SettingsSection>
  );
}

export default function GroupSocialGraphSettingsPage({
  params,
}: PageProps<"/[actor]/settings/social-graph">) {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <GroupSocialGraph params={params} />
    </Suspense>
  );
}
