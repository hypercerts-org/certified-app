import type { Metadata } from "next";
import { Suspense } from "react";
import {
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/settings-frame";
import { ThemeModeControl } from "@/components/theme-control";

export const metadata: Metadata = { title: "Appearance" };

async function AppearanceSettings() {
  const access = await requirePersonalSettings("/settings/appearance");
  if (!access) return null;
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

export default function PersonalAppearanceSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={1} />}>
      <AppearanceSettings />
    </Suspense>
  );
}
