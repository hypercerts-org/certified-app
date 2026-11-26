import type { Metadata } from "next";
import { Suspense } from "react";
import {
  requirePersonalSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsCard, SettingsSection } from "@/components/settings/settings-frame";
import { ThemeModeControl } from "@/components/theme-control";

export const metadata: Metadata = { title: "Appearance" };

async function AppearanceSettings() {
  const access = await requirePersonalSettings("/settings/appearance");
  if (!access) return null;
  return (
    <SettingsSection description="How Certified looks on this device.">
      <SettingsCard
        title="Theme"
        description="Choose light mode, dark mode, or follow your operating system preference."
        hint="Saved locally in this browser."
      >
        <ThemeModeControl />
      </SettingsCard>
    </SettingsSection>
  );
}

export default function PersonalAppearanceSettingsPage() {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <AppearanceSettings />
    </Suspense>
  );
}
