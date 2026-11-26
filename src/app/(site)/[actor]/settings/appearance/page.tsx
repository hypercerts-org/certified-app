import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireGroupSettings, SettingsRowsSkeleton } from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";
import { ThemeModeControl } from "@/components/theme-control";
import { groupSettingsHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Appearance" };

async function GroupAppearance({ params }: { params: Promise<{ actor: string }> }) {
  const access = await requireGroupSettings(params, "/appearance");
  if (!access) return null;
  if (!access.isSelfOwned) redirect(groupSettingsHref(access.groupDid));
  return (
    <SettingsSection>
      <SettingsGroup title="Appearance" description="How Certified looks on this device.">
        <SettingsRow
          label="Theme"
          description="Choose light mode, dark mode, or follow your operating system preference."
        >
          <ThemeModeControl />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

export default function GroupAppearanceSettingsPage({
  params,
}: PageProps<"/[actor]/settings/appearance">) {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={1} />}>
      <GroupAppearance params={params} />
    </Suspense>
  );
}
