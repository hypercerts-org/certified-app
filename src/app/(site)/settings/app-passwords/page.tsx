import type { Metadata } from "next";
import { Suspense } from "react";
import { AppPasswordsSection } from "@/components/settings/app-passwords-section";
import {
  requirePersonalSettings,
  SettingsRowsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "App passwords" };

async function PersonalAppPasswords() {
  const access = await requirePersonalSettings("/settings/app-passwords");
  if (!access) return null;
  return (
    <SettingsSection>
      <AppPasswordsSection />
    </SettingsSection>
  );
}

export default function PersonalAppPasswordsSettingsPage() {
  return (
    <Suspense fallback={<SettingsRowsSkeleton rows={2} />}>
      <PersonalAppPasswords />
    </Suspense>
  );
}
