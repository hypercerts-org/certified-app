import type { Metadata } from "next";
import { Suspense } from "react";
import { BlueskySyncSection } from "@/components/settings/bluesky-sync-section";
import { requireGroupSettings, SettingsRowsSkeleton } from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "Bluesky sync" };

async function GroupBlueskySync({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/bluesky-sync");
  if (!access) return null;
  return (
    <SettingsSection>
      <BlueskySyncSection
        repoDid={access.groupDid}
        allowExport={access.isSelfOwned}
        description="Compare this group's Certified follows with its Bluesky follows, and import the ones missing here."
      />
    </SettingsSection>
  );
}

export default function GroupBlueskySyncSettingsPage({
  params,
}: PageProps<"/[actor]/settings/bluesky-sync">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={2} />}>
      <GroupBlueskySync params={params} />
    </Suspense>
  );
}
